// Location: ./client/server/src/routes/auth/login.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// POST /auth/login: browser -> BFF only. The BFF makes its own
// server-to-server call to the upstream FastAPI login endpoint and never
// forwards the resulting access_token to the browser — only an opaque
// session_id cookie goes back. See agent-output/microfrontend-bff-auth-architecture.md.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
  SESSION_COOKIE_NAME,
  type SessionUser,
} from "../../lib/session-store.js";
import { setNoStore } from "../../lib/no-store.js";
import { isForbiddenCrossOrigin } from "../../lib/origin-guard.js";
import { CSRF_COOKIE_NAME } from "../../plugins/csrf.js";

interface LoginBody {
  email: string;
  password: string;
}

// Mirrors mcpgateway.schemas.AuthenticationResponse. `user` is forwarded to
// the browser verbatim (see SessionUser) — the BFF only needs access_token
// and expires_in.
interface UpstreamAuthenticationResponse {
  access_token: string;
  expires_in: number;
  user: SessionUser;
}

export default async function loginRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: LoginBody }>(
    "/auth/login",
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      setNoStore(reply);

      if (isForbiddenCrossOrigin(request)) {
        return reply.code(403).send({ error: "cross_site_request_forbidden" });
      }

      const { email, password } = request.body ?? {};
      if (!email || !password) {
        return reply.code(400).send({ error: "email and password are required" });
      }

      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(`${config.contextforgeUrl}/auth/email/login`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Preserve real client IP for upstream audit logging.
            "x-forwarded-for": request.ip,
            "x-real-ip": request.ip,
          },
          body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        request.log.error({ err }, "upstream login request failed");
        return reply.code(502).send({ error: "upstream_unavailable" });
      }

      if (!upstreamResponse.ok) {
        // A failed login must not leave a pre-existing bff_sid/CSRF cookie
        // pair sitting in the browser — otherwise a stale-but-still-live
        // session survives the failed attempt and a mutating request made
        // right after can ride that leftover cookie into a confusing
        // downstream 403 instead of a clean 401. Drop the Redis session (if
        // any) and clear both cookies, same as an explicit /auth/logout.
        // See contextforge-org/contextforge-web-ui#10.
        const staleSessionId = request.cookies[SESSION_COOKIE_NAME];
        if (staleSessionId) {
          await deleteSession(fastify.redis, staleSessionId);
        }
        clearSessionCookie(reply);
        reply.clearCookie(CSRF_COOKIE_NAME, { path: "/", domain: config.cookieDomain });

        // Upstream 401/403/429 pass through as-is; body may carry rate-limit or
        // lockout detail the SPA's login form wants to show.
        const detail = await upstreamResponse.text();
        return reply.code(upstreamResponse.status).send({ error: "login_failed", detail });
      }

      let auth: UpstreamAuthenticationResponse; // pragma: allowlist secret
      try {
        auth = (await upstreamResponse.json()) as UpstreamAuthenticationResponse;
      } catch (err) {
        request.log.error({ err }, "upstream login returned a non-JSON 2xx body");
        return reply.code(502).send({ error: "upstream_invalid_response" });
      }

      if (typeof auth.access_token !== "string" || !auth.access_token) {
        request.log.error({ auth }, "upstream login 2xx response missing access_token");
        return reply.code(502).send({ error: "upstream_invalid_response" });
      }

      // The BFF session/cookie must not outlive the bearer token it wraps —
      // use the upstream JWT's own lifetime, not a fixed BFF-side default.
      // See createSession's comment in lib/session-store.ts.
      let ttlSeconds = config.sessionTtlSeconds;
      if (Number.isFinite(auth.expires_in) && auth.expires_in > 0) {
        ttlSeconds = auth.expires_in;
      } else {
        // Upstream returned a bogus expires_in — fall back, but log it: this
        // means the BFF session can outlive the JWT it wraps until the
        // proxy's revoke-on-401 catches up (see session-store.ts).
        request.log.warn(
          { expires_in: auth.expires_in },
          "upstream login returned invalid expires_in, using BFF default session TTL",
        );
      }

      const sessionId = await createSession(
        fastify.redis,
        {
          bearerToken: auth.access_token,
          user: auth.user,
        },
        ttlSeconds,
      );

      setSessionCookie(reply, sessionId, ttlSeconds);
      // generateCsrf() only mints a fresh secret when request.cookies has no
      // bff_csrf entry — reply.clearCookie() alone doesn't clear that (it
      // only queues an outgoing Set-Cookie, request.cookies is untouched),
      // so delete it directly to force rotation. Otherwise a secret planted
      // before login (subdomain XSS, a plaintext hop with COOKIE_SECURE=false)
      // survives into the authenticated session.
      delete request.cookies[CSRF_COOKIE_NAME];
      // Cookie holds the CSRF secret (HttpOnly); the SPA needs the derived
      // token itself to echo back via X-CSRF-Token — see plugins/csrf.ts.
      const csrfToken = await reply.generateCsrf();

      return reply.send({ user: auth.user, csrfToken });
    },
  );
}
