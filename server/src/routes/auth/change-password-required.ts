// Location: ./client/server/src/routes/auth/change-password-required.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// POST /auth/change-password-required: browser -> BFF only, pre-login. Used
// when /auth/login rejected valid credentials with a "password change
// required" 403 (see routes/auth/login.ts, which authenticates against
// upstream's /auth/email/login — that endpoint hard-blocks with 403 for the
// whole lifetime of the password_change_required flag, confirmed against a
// live backend). This route instead:
//
//   A. authenticates against upstream's plain /auth/login ("Tier 1" session
//      auth), which does NOT enforce that flag and still mints a token for a
//      flagged account, using the OLD password; the response's
//      user.password_change_required is then checked server-side — this is
//      the ONLY gate before mutating state, so it must actually be true, or
//      this route would just be an unauthenticated "change password with old
//      password" endpoint for any account;
//   B. uses that bypass token once to call the authenticated change-password
//      endpoint;
//   C. revokes the bypass token upstream (best-effort — it's served its one
//      purpose and shouldn't linger);
//   D. logs in again for real, via the same upstream /auth/email/login
//      login.ts uses, now with the NEW password (the block is gone once the
//      password's been changed);
//   E. establishes a normal BFF session from that — identical to a plain
//      login, so a successful password change lands the user straight in
//      the app.
//
// On success this returns the exact same { user, csrfToken } shape as
// POST /auth/login, so the SPA can treat it identically to a login.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import {
  establishSession,
  type UpstreamAuthenticationResponse,
} from "../../lib/establish-session.js";
import { revokeUpstreamToken } from "../../lib/revoke-upstream-token.js";
import { setNoStore } from "../../lib/no-store.js";
import { isForbiddenCrossOrigin } from "../../lib/origin-guard.js";
import type { SessionUser } from "../../lib/session-store.js";
import { upstreamAuthHeader } from "../../lib/upstream-auth.js";

interface ChangePasswordRequiredBody {
  email: string;
  oldPassword: string;
  newPassword: string;
}

interface UpstreamBypassLoginResponse {
  access_token: string;
  user: SessionUser;
}

// Caps each individual upstream leg — a hung (not refused) upstream must not
// hold the request open indefinitely, same rationale as
// revoke-upstream-token.ts's UPSTREAM_REVOKE_TIMEOUT_MS.
const UPSTREAM_REQUEST_TIMEOUT_MS = 3000;

async function upstreamLogin(
  request: FastifyRequest,
  email: string,
  password: string,
): Promise<Response> {
  return fetch(`${config.contextforgeUrl}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": request.ip,
      "x-real-ip": request.ip,
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(UPSTREAM_REQUEST_TIMEOUT_MS),
  });
}

export default async function changePasswordRequiredRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: ChangePasswordRequiredBody }>(
    "/auth/change-password-required",
    async (request: FastifyRequest<{ Body: ChangePasswordRequiredBody }>, reply: FastifyReply) => {
      setNoStore(reply);

      if (isForbiddenCrossOrigin(request)) {
        return reply.code(403).send({ error: "cross_site_request_forbidden" });
      }

      const { email, oldPassword, newPassword } = request.body ?? {};
      if (!email || !oldPassword || !newPassword) {
        return reply.code(400).send({ error: "email, oldPassword and newPassword are required" });
      }

      // Step A: mint a bypass token using the old (still-valid) credentials.
      // Deliberately /auth/login, not /auth/email/login — the latter
      // hard-blocks while password_change_required is set, the former does
      // not (verified against a live backend).
      let bypassLoginResponse: Response;
      try {
        bypassLoginResponse = await upstreamLogin(request, email, oldPassword);
      } catch (err) {
        request.log.error({ err }, "upstream bypass login (change-password-required) failed");
        return reply.code(502).send({ error: "upstream_unavailable" });
      }

      if (!bypassLoginResponse.ok) {
        // Covers both "still password-change-blocked" and "old password
        // wrong" — don't try to disambiguate via text; the SPA falls back to
        // the forgot-password flow on any failure here.
        const detail = await bypassLoginResponse.text();
        return reply
          .code(bypassLoginResponse.status)
          .send({ error: "change_password_failed", detail });
      }

      let bypassAuth: UpstreamBypassLoginResponse; // pragma: allowlist secret
      try {
        bypassAuth = (await bypassLoginResponse.json()) as UpstreamBypassLoginResponse;
      } catch (err) {
        request.log.error({ err }, "upstream bypass login returned a non-JSON 2xx body");
        return reply.code(502).send({ error: "upstream_invalid_response" });
      }

      if (typeof bypassAuth.access_token !== "string" || !bypassAuth.access_token) {
        request.log.error(
          { bypassAuth },
          "upstream bypass login 2xx response missing access_token",
        );
        return reply.code(502).send({ error: "upstream_invalid_response" });
      }
      const bypassToken = bypassAuth.access_token;

      // Precondition: this route only exists to unblock accounts upstream
      // has actually flagged. Without this check, a valid old password alone
      // would rotate ANY account's password through this pre-auth endpoint.
      if (bypassAuth.user?.password_change_required !== true) {
        request.log.warn(
          { email },
          "change-password-required called for an account that does not require a password change",
        );
        // Bypass token served no purpose — revoke it before replying, same
        // as the change-password-failed branch below.
        await revokeUpstreamToken(request, bypassToken);
        return reply.code(403).send({ error: "password_change_not_required" });
      }

      // Step B: use the bypass token once, immediately, to change the password.
      let changeResponse: Response;
      try {
        changeResponse = await fetch(`${config.contextforgeUrl}/auth/email/change-password`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...upstreamAuthHeader(bypassToken),
          },
          body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
          signal: AbortSignal.timeout(UPSTREAM_REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        request.log.error({ err }, "upstream change-password failed");
        return reply.code(502).send({ error: "upstream_unavailable" });
      }

      if (!changeResponse.ok) {
        // Password change itself failed (e.g. new-password policy violation)
        // — the bypass token served no purpose, revoke it before replying.
        await revokeUpstreamToken(request, bypassToken);
        const detail = await changeResponse.text();
        return reply.code(changeResponse.status).send({ error: "change_password_failed", detail });
      }

      // Step C: the bypass token has done its one job — revoke it upstream
      // rather than let it float until its natural expiry. Best-effort.
      await revokeUpstreamToken(request, bypassToken);

      // Step D: the password is changed — log in for real with the new
      // password, exactly like login.ts does, to get a full session.
      let realLoginResponse: Response;
      try {
        realLoginResponse = await fetch(`${config.contextforgeUrl}/auth/email/login`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": request.ip,
            "x-real-ip": request.ip,
          },
          body: JSON.stringify({ email, password: newPassword }),
          signal: AbortSignal.timeout(UPSTREAM_REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        request.log.error({ err }, "post-change-password login failed");
        return reply.code(502).send({ error: "login_after_change_failed" });
      }

      if (!realLoginResponse.ok) {
        // The password WAS changed successfully — this is not a
        // change-password failure, it's a (rare) inability to establish a
        // session right after. Distinct error so the SPA doesn't show a
        // "wrong password"/policy-violation message for a change that
        // actually succeeded.
        request.log.error(
          { status: realLoginResponse.status },
          "password changed but post-change login was rejected",
        );
        return reply.code(502).send({ error: "login_after_change_failed" });
      }

      let realAuth: UpstreamAuthenticationResponse; // pragma: allowlist secret
      try {
        realAuth = (await realLoginResponse.json()) as UpstreamAuthenticationResponse;
      } catch (err) {
        request.log.error({ err }, "post-change-password login returned a non-JSON 2xx body");
        return reply.code(502).send({ error: "login_after_change_failed" });
      }

      if (typeof realAuth.access_token !== "string" || !realAuth.access_token) {
        request.log.error({ realAuth }, "post-change-password login missing access_token");
        return reply.code(502).send({ error: "login_after_change_failed" });
      }

      // Step E: establish a normal BFF session, identical to login.ts.
      const { user, csrfToken } = await establishSession(fastify, request, reply, realAuth);
      return reply.send({ user, csrfToken });
    },
  );
}
