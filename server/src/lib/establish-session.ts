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

// Mirrors mcpgateway.schemas.AuthenticationResponse.
export interface UpstreamAuthenticationResponse {
  access_token: string;
  expires_in: number;
  user: SessionUser;
}

export async function establishSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  auth: UpstreamAuthenticationResponse,
): Promise<{ user: SessionUser; csrfToken: string }> {
  // The BFF session/cookie must not outlive the bearer token it wraps — use
  // the upstream JWT's own lifetime, not a fixed BFF-side default. See
  // createSession's comment in lib/session-store.ts.
  let ttlSeconds = config.sessionTtlSeconds;
  if (Number.isFinite(auth.expires_in) && auth.expires_in > 0) {
    ttlSeconds = auth.expires_in;
  } else {
    // Upstream returned a bogus expires_in — fall back, but log it: this
    // means the BFF session can outlive the JWT it wraps until the proxy's
    // revoke-on-401 catches up (see session-store.ts).
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
