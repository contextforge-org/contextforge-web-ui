// Location: ./client/server/src/lib/establish-session.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Given an upstream AuthenticationResponse, create the BFF session + rotate
// the CSRF secret + hand back what the caller needs to reply with. Shared by
// routes/auth/login.ts and routes/auth/change-password-required.ts so the
// JWT-lifetime/session-TTL matching and CSRF-rotation security properties
// live in exactly one place.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.js";
import { createSession, setSessionCookie, type SessionUser } from "./session-store.js";
import { CSRF_COOKIE_NAME } from "../plugins/csrf.js";

// Mirrors mcpgateway.schemas.AuthenticationResponse. expires_in is optional —
// not every upstream login-shaped endpoint this BFF calls is guaranteed to
// send it (see lib/upstream-login.ts's Tier-1 /auth/login bypass call).
export interface UpstreamAuthenticationResponse {
  access_token: string;
  expires_in?: number;
  user: SessionUser;
}

/**
 * Thrown when the upstream auth response still reports
 * password_change_required=true. This is the single chokepoint every
 * session-establishing route goes through, so it's also the single place
 * that guarantees a session is never minted for a still-flagged account —
 * callers don't each have to re-implement that check correctly. In today's
 * two callers this should never actually trip (routes/auth/login.ts only
 * gets here after upstream's own 2xx says the account is clear;
 * routes/auth/change-password-required.ts only gets here after a successful
 * change), but it's the backstop for any future login path (SSO callback,
 * admin impersonation, ...) that calls establishSession() directly.
 */
export class PasswordChangeStillRequiredError extends Error {
  constructor() {
    super("upstream auth response still has password_change_required=true");
    this.name = "PasswordChangeStillRequiredError";
  }
}

export async function establishSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  auth: UpstreamAuthenticationResponse,
): Promise<{ user: SessionUser; csrfToken: string }> {
  if (auth.user?.password_change_required === true) {
    throw new PasswordChangeStillRequiredError();
  }

  // The BFF session/cookie must not outlive the bearer token it wraps — use
  // the upstream JWT's own lifetime, not a fixed BFF-side default. See
  // createSession's comment in lib/session-store.ts.
  let ttlSeconds = config.sessionTtlSeconds;
  if (Number.isFinite(auth.expires_in) && auth.expires_in! > 0) {
    ttlSeconds = auth.expires_in!;
  } else if (auth.expires_in !== undefined) {
    // Upstream sent expires_in, but it's not a usable positive number — fall
    // back, but log it: this means the BFF session can outlive the JWT it
    // wraps until the proxy's revoke-on-401 catches up (see session-store.ts).
    // A simply *absent* expires_in is not logged here — some upstream
    // login-shaped endpoints don't send it by design (see upstream-login.ts).
    request.log.warn(
      { expires_in: auth.expires_in },
      "upstream login returned invalid expires_in, using BFF default session TTL",
    );
  }

  const sessionId = await createSession(
    fastify.redis,
    { bearerToken: auth.access_token, user: auth.user },
    ttlSeconds,
  );

  setSessionCookie(reply, sessionId, ttlSeconds);
  // generateCsrf() only mints a fresh secret when request.cookies has no
  // bff_csrf entry — reply.clearCookie() alone doesn't clear that (it only
  // queues an outgoing Set-Cookie, request.cookies is untouched), so delete
  // it directly to force rotation. Otherwise a secret planted before login
  // (subdomain XSS, a plaintext hop with COOKIE_SECURE=false) survives into
  // the authenticated session.
  delete request.cookies[CSRF_COOKIE_NAME];
  // Cookie holds the CSRF secret (HttpOnly); the SPA needs the derived token
  // itself to echo back via X-CSRF-Token — see plugins/csrf.ts.
  const csrfToken = await reply.generateCsrf();

  return { user: auth.user, csrfToken };
}
