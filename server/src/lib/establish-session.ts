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

export interface SsoTokens {
  refreshToken?: string;
  idToken?: string;
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
  auth: UpstreamAuthenticationResponse, // pragma: allowlist secret
  ssoTokens?: SsoTokens,
): Promise<{ user: SessionUser; csrfToken: string }> {
  if (auth.user?.password_change_required === true) {
    throw new PasswordChangeStillRequiredError();
  }

  const validExpiresIn =
    Number.isFinite(auth.expires_in) && auth.expires_in! > 0 ? auth.expires_in! : undefined;
  if (validExpiresIn === undefined && auth.expires_in !== undefined) {
    request.log.warn(
      { expires_in: auth.expires_in },
      "upstream login returned invalid expires_in, using BFF default session TTL",
    );
  }

  // Password-login sessions have no refresh path, so the cookie/Redis TTL
  // must match the JWT's own lifetime (session dies when the JWT does). SSO
  // sessions can outlive the access token via refreshToken -- tying them to
  // the same short expires_in would make sessionAuth's refresh unreachable
  // for any idle gap longer than one access-token lifetime.
  const ttlSeconds = ssoTokens
    ? config.sessionTtlSeconds
    : (validExpiresIn ?? config.sessionTtlSeconds);
  const ssoTokenTtlSeconds = validExpiresIn ?? 0;

  const sessionId = await createSession(
    fastify.redis,
    {
      bearerToken: auth.access_token,
      user: auth.user,
      refreshToken: ssoTokens?.refreshToken,
      idToken: ssoTokens?.idToken,
      tokenExpiresAt: ssoTokens ? Math.floor(Date.now() / 1000) + ssoTokenTtlSeconds : undefined,
    },
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
