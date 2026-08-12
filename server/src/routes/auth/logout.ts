// Location: ./client/server/src/routes/auth/logout.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// POST /auth/logout: CSRF-protected like any other state-changing
// browser->BFF call. Idempotent w.r.t. session state — clears cookies and
// drops the Redis session even if session_id is already missing/expired
// (double-click or retry), as long as the caller still holds a valid CSRF
// cookie/token pair.
//
// Also revokes the upstream JWT itself via FastAPI's bearer-token logout
// (mcpgateway/routers/auth.py POST /auth/logout, blocklist-backed —
// DB or Redis depending on deployment). Without this, dropping the BFF's
// own session/cookie only makes the token unreachable from the browser;
// the JWT stays cryptographically valid until its natural TOKEN_EXPIRY.
// Best-effort: an upstream failure (network blip, already-revoked token)
// must not block the BFF-side logout the user is waiting on.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import {
  clearSessionCookie,
  deleteSession,
  getSession,
  SESSION_COOKIE_NAME,
} from "../../lib/session-store.js";
import { CSRF_COOKIE_NAME } from "../../plugins/csrf.js";
import { upstreamAuthHeader } from "../../lib/upstream-auth.js";
import { setNoStore } from "../../lib/no-store.js";

// The user is waiting on this request, so cap how long a hung (not refused)
// upstream can hold it open.
const UPSTREAM_REVOKE_TIMEOUT_MS = 3000;

async function revokeUpstreamToken(request: FastifyRequest, bearerToken: string): Promise<void> {
  try {
    const response = await fetch(`${config.fastapiUrl}/auth/logout`, {
      method: "POST",
      headers: upstreamAuthHeader(bearerToken),
      signal: AbortSignal.timeout(UPSTREAM_REVOKE_TIMEOUT_MS),
    });
    if (!response.ok) {
      request.log.warn(
        { status: response.status },
        "upstream token revocation returned a non-2xx status",
      );
    }
  } catch (err) {
    request.log.warn({ err }, "upstream token revocation failed");
  }
}

export default async function logoutRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/auth/logout",
    { preHandler: [fastify.csrfProtection] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      setNoStore(reply);

      const sessionId = request.cookies[SESSION_COOKIE_NAME];
      if (sessionId) {
        const record = await getSession(fastify.redis, sessionId);
        // Drop the BFF session first: the upstream revoke is best-effort and
        // must not leave a live session behind if it stalls or throws.
        await deleteSession(fastify.redis, sessionId);
        if (record) {
          await revokeUpstreamToken(request, record.bearerToken);
        }
      }

      clearSessionCookie(reply);
      // domain must match csrf.ts's setCookie or this clear is a no-op under COOKIE_DOMAIN.
      reply.clearCookie(CSRF_COOKIE_NAME, { path: "/", domain: config.cookieDomain });

      return reply.send({ ok: true });
    },
  );
}
