// Location: ./client/server/src/routes/auth/change-password-required.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// POST /auth/change-password-required: browser -> BFF only, pre-login. Used
// when /auth/login rejected valid credentials with a "password change
// required" 403 (see routes/auth/login.ts). This route:
//
//   1. Verifies the precondition via the SAME endpoint/logic that produced
//      the original block: upstream's /auth/email/login, with the OLD
//      password. Deliberately NOT a check against a persisted flag — upstream
//      computes "needs password change" from several independent sources
//      (a persisted flag, password-age expiry, default-password detection),
//      and only /auth/email/login's own 403 reflects all of them. A 403 here
//      also proves the old password is correct (upstream validates
//      credentials before deciding whether to block). A 200 here means the
//      account does NOT currently need a change — reject without ever
//      minting a bypass token.
//   2. Mints a short-lived bypass token via upstream's plain /auth/login
//      ("Tier 1" session auth), which does not enforce the block, using the
//      same OLD password step 1 just validated.
//   3. Uses that bypass token once to call the authenticated change-password
//      endpoint.
//   4. Revokes the bypass token upstream (best-effort, fire-and-forget — it's
//      served its one purpose and shouldn't linger, but nothing downstream
//      depends on the revoke actually completing).
//   5. Logs in again for real, via the same upstream /auth/email/login
//      login.ts uses, now with the NEW password (the block is gone once the
//      password's been changed).
//   6. Establishes a normal BFF session from that — identical to a plain
//      login, so a successful password change lands the user straight in
//      the app.
//
// On success this returns the exact same { user, csrfToken } shape as
// POST /auth/login, so the SPA can treat it identically to a login.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { establishSession, PasswordChangeStillRequiredError } from "../../lib/establish-session.js";
import { revokeUpstreamToken } from "../../lib/revoke-upstream-token.js";
import { setNoStore } from "../../lib/no-store.js";
import { isForbiddenCrossOrigin } from "../../lib/origin-guard.js";
import { upstreamAuthHeader } from "../../lib/upstream-auth.js";
import { upstreamLogin } from "../../lib/upstream-login.js";

interface ChangePasswordRequiredBody {
  email: string;
  oldPassword: string;
  newPassword: string;
}

// Caps the change-password call itself — the two login-shaped calls already
// time out via upstreamLogin()'s own UPSTREAM_LOGIN_TIMEOUT_MS.
const UPSTREAM_REQUEST_TIMEOUT_MS = 3000;

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

      // Step 1: precondition + credential check, via the endpoint that
      // actually computes "needs password change" (persisted flag, password
      // age, default-password detection — see module comment above).
      const precondition = await upstreamLogin(request, "/auth/email/login", email, oldPassword);

      if (precondition.ok) {
        // Correct old password, but the account doesn't currently need a
        // change (stale link, flag cleared elsewhere, etc.) — nothing to do,
        // and no bypass token was ever minted. Revoke the token this
        // legitimate login just handed us, since we're not using it.
        void revokeUpstreamToken(request, precondition.auth.access_token);
        return reply.code(403).send({ error: "password_change_not_required" });
      }

      if (precondition.kind === "unavailable") {
        return reply.code(502).send({ error: "upstream_unavailable" });
      }
      if (precondition.kind === "invalid_response") {
        return reply.code(502).send({ error: "upstream_invalid_response" });
      }
      if (precondition.status !== 403) {
        // 401 (wrong old password), 429 (rate-limited), etc. — pass through
        // as-is; don't try to mint a bypass token for a credential the
        // precondition check already told us is wrong or blocked.
        return reply
          .code(precondition.status)
          .send({ error: "change_password_failed", detail: precondition.detail });
      }

      // Step 2: mint a bypass token using the same old credentials step 1
      // just validated. Deliberately /auth/login, not /auth/email/login —
      // the latter hard-blocks while the account needs a password change,
      // the former does not (verified against a live backend).
      const bypass = await upstreamLogin(request, "/auth/login", email, oldPassword);
      if (!bypass.ok) {
        if (bypass.kind === "unavailable") {
          return reply.code(502).send({ error: "upstream_unavailable" });
        }
        if (bypass.kind === "invalid_response") {
          return reply.code(502).send({ error: "upstream_invalid_response" });
        }
        return reply
          .code(bypass.status)
          .send({ error: "change_password_failed", detail: bypass.detail });
      }
      const bypassToken = bypass.auth.access_token;

      // Step 3: use the bypass token once, immediately, to change the
      // password. Same audit-IP headers as every other upstream call here.
      let changeResponse: Response;
      try {
        changeResponse = await fetch(`${config.contextforgeUrl}/auth/email/change-password`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": request.ip,
            "x-real-ip": request.ip,
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
        // — the bypass token served no purpose. Fire-and-forget revoke: the
        // reply doesn't depend on it, and revokeUpstreamToken never throws.
        void revokeUpstreamToken(request, bypassToken);
        const detail = await changeResponse.text();
        return reply.code(changeResponse.status).send({ error: "change_password_failed", detail });
      }

      // Step 4: the bypass token has done its one job — revoke it upstream
      // rather than let it float until its natural expiry. Best-effort,
      // fire-and-forget: nothing below depends on this finishing first.
      void revokeUpstreamToken(request, bypassToken);

      // Step 5: the password is changed — log in for real with the new
      // password, exactly like login.ts does, to get a full session.
      const realLogin = await upstreamLogin(request, "/auth/email/login", email, newPassword);
      if (!realLogin.ok) {
        // The password WAS changed successfully — this is not a
        // change-password failure, it's a (rare) inability to establish a
        // session right after. Distinct error so the SPA doesn't show a
        // "wrong password"/policy-violation message for a change that
        // actually succeeded.
        request.log.error({ realLogin }, "password changed but post-change login was rejected");
        return reply.code(502).send({ error: "login_after_change_failed" });
      }

      // Step 6: establish a normal BFF session, identical to login.ts.
      try {
        const { user, csrfToken } = await establishSession(fastify, request, reply, realLogin.auth);
        return reply.send({ user, csrfToken });
      } catch (err) {
        if (err instanceof PasswordChangeStillRequiredError) {
          // Password changed, but upstream still reports the account as
          // flagged (flag not cleared, age not reset, ...) — same "changed
          // but couldn't sign back in" story as the branches above.
          request.log.error(
            { email },
            "password changed but post-change login still flagged password_change_required",
          );
          return reply.code(502).send({ error: "login_after_change_failed" });
        }
        throw err;
      }
    },
  );
}
