// Location: ./client/server/src/lib/revoke-upstream-token.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Revokes an upstream bearer token via FastAPI's bearer-token logout
// (mcpgateway/routers/auth.py POST /auth/logout, blocklist-backed — DB or
// Redis depending on deployment). Without this, a token that's no longer
// reachable from the browser stays cryptographically valid until its
// natural TOKEN_EXPIRY. Best-effort: an upstream failure (network blip,
// already-revoked token) must never block whatever the caller is doing.
//
// Shared by routes/auth/logout.ts (revoking the real session token) and
// routes/auth/change-password-required.ts (revoking the short-lived bypass
// token minted via /auth/login).

import type { FastifyRequest } from "fastify";

import { config } from "../config.js";
import { upstreamAuthHeader } from "./upstream-auth.js";

// The caller is usually waiting on this request, so cap how long a hung
// (not refused) upstream can hold it open.
const UPSTREAM_REVOKE_TIMEOUT_MS = 3000;

export async function revokeUpstreamToken(
  request: FastifyRequest,
  bearerToken: string,
): Promise<void> {
  try {
    const response = await fetch(`${config.contextforgeUrl}/auth/logout`, {
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
