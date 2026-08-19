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
import { clearSessionCookie, deleteSession, SESSION_COOKIE_NAME } from "../../lib/session-store.js";
import { establishSession, PasswordChangeStillRequiredError } from "../../lib/establish-session.js";
import { setNoStore } from "../../lib/no-store.js";
import { isForbiddenCrossOrigin } from "../../lib/origin-guard.js";
import { upstreamLogin } from "../../lib/upstream-login.js";
import { CSRF_COOKIE_NAME } from "../../plugins/csrf.js";

interface LoginBody {
  email: string;
  password: string;
}

// A failed login must not leave a pre-existing bff_sid/CSRF cookie pair
// sitting in the browser — otherwise a stale-but-still-live session survives
// the failed attempt and a mutating request made right after can ride that
// leftover cookie into a confusing downstream 403 instead of a clean 401.
// Called from every same-origin failure exit below (missing credentials,
// upstream unreachable, non-2xx upstream, malformed/incomplete 2xx body,
// still-flagged account) so the cleanup can't drift out of sync with the
// SPA's AuthContext.login(), which resets its own state on any rejected
// login call.
// Deliberately NOT called from the isForbiddenCrossOrigin() branch above —
// that guards against a cross-site page silently POSTing to /auth/login to
// mass-clear victims' legitimate sessions; only same-origin login attempts
// should be able to invalidate the session they're layered on top of.
// See contextforge-org/contextforge-web-ui#10.
async function clearStaleSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const staleSessionId = request.cookies[SESSION_COOKIE_NAME];
  if (staleSessionId) {
    try {
      await deleteSession(fastify.redis, staleSessionId);
    } catch (err) {
      // Redis being unavailable must not block the cookie clear below (the
      // browser-visible half of cleanup) or the login-failure response.
      request.log.warn({ err }, "failed to drop stale Redis session on login failure");
    }
  }
  // Clear cookies unconditionally, even with no session cookie on the
  // request — cheap, idempotent, and covers a CSRF-only leftover cookie.
  clearSessionCookie(reply);
  reply.clearCookie(CSRF_COOKIE_NAME, { path: "/", domain: config.cookieDomain });
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
        await clearStaleSession(fastify, request, reply);
        return reply.code(400).send({ error: "email and password are required" });
      }

      const result = await upstreamLogin(request, "/auth/email/login", email, password);

      if (!result.ok) {
        await clearStaleSession(fastify, request, reply);
        if (result.kind === "unavailable") {
          return reply.code(502).send({ error: "upstream_unavailable" });
        }
        if (result.kind === "invalid_response") {
          return reply.code(502).send({ error: "upstream_invalid_response" });
        }
        // Upstream 401/403/429 pass through as-is; body may carry rate-limit or
        // lockout detail the SPA's login form wants to show.
        return reply.code(result.status).send({ error: "login_failed", detail: result.detail });
      }

      try {
        const { user, csrfToken } = await establishSession(fastify, request, reply, result.auth);
        return reply.send({ user, csrfToken });
      } catch (err) {
        if (err instanceof PasswordChangeStillRequiredError) {
          // Defensive backstop (see establishSession's doc comment) — upstream
          // returned 2xx but the account is still flagged. Respond exactly
          // like the normal password-change-required block so the SPA's
          // classifyLoginError still routes the user to the recovery page.
          await clearStaleSession(fastify, request, reply);
          request.log.error(
            { email },
            "upstream login 2xx but user still flagged password_change_required — refusing to establish a session",
          );
          return reply.code(403).send({
            error: "login_failed",
            detail: JSON.stringify({
              detail: "Password change required. Please change your password before continuing.",
            }),
          });
        }
        throw err;
      }
    },
  );
}
