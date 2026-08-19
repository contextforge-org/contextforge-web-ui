// Location: ./client/server/src/lib/upstream-login.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Shared "call an upstream login-shaped endpoint, validate the 2xx body"
// logic. Used by routes/auth/login.ts (Tier-2 /auth/email/login) and
// routes/auth/change-password-required.ts (both the Tier-2 precondition
// check and the Tier-1 /auth/login bypass, plus the post-change Tier-2
// login) so the fetch/timeout/header/JSON-parse/access_token-check pattern
// lives in exactly one place instead of being copied per call site.

import type { FastifyRequest } from "fastify";

import { config } from "../config.js";
import type { UpstreamAuthenticationResponse } from "./establish-session.js";

// A hung (not refused) upstream must not hold the request open indefinitely
// — same rationale as revoke-upstream-token.ts's UPSTREAM_REVOKE_TIMEOUT_MS.
const UPSTREAM_LOGIN_TIMEOUT_MS = 3000;

export type UpstreamLoginResult =
  | { ok: true; auth: UpstreamAuthenticationResponse }
  | { ok: false; kind: "unavailable" }
  | { ok: false; kind: "rejected"; status: number; detail: string }
  | { ok: false; kind: "invalid_response" };

/**
 * POSTs { email, password } to an upstream login-shaped path and validates
 * the 2xx body. `path` is the upstream path only (e.g. "/auth/login" or
 * "/auth/email/login") — config.contextforgeUrl is prepended.
 */
export async function upstreamLogin(
  request: FastifyRequest,
  path: string,
  email: string,
  password: string,
): Promise<UpstreamLoginResult> {
  let response: Response;
  try {
    response = await fetch(`${config.contextforgeUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Preserve real client IP for upstream audit logging.
        "x-forwarded-for": request.ip,
        "x-real-ip": request.ip,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(UPSTREAM_LOGIN_TIMEOUT_MS),
    });
  } catch (err) {
    request.log.error({ err, path }, "upstream login request failed");
    return { ok: false, kind: "unavailable" };
  }

  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, kind: "rejected", status: response.status, detail };
  }

  let auth: UpstreamAuthenticationResponse; // pragma: allowlist secret
  try {
    auth = (await response.json()) as UpstreamAuthenticationResponse;
  } catch (err) {
    request.log.error({ err, path }, "upstream login returned a non-JSON 2xx body");
    return { ok: false, kind: "invalid_response" };
  }

  if (typeof auth.access_token !== "string" || !auth.access_token) {
    request.log.error({ auth, path }, "upstream login 2xx response missing access_token");
    return { ok: false, kind: "invalid_response" };
  }

  return { ok: true, auth };
}
