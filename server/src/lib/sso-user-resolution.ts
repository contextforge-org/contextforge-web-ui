// Location: ./client/server/src/lib/sso-user-resolution.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Decodes an ID token's claims into a SessionUser. No signature verification
// -- the token arrives over a direct server-to-server TLS call to Keycloak's
// own token endpoint, not client-supplied. Used by routes/auth/sso-callback.ts.

import type { SessionUser } from "./session-store.js";

export interface SsoIdTokenClaims {
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  nonce?: string;
  [key: string]: unknown;
}

export class SsoIdTokenError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SsoIdTokenError";
  }
}

export function decodeSsoIdToken(idToken: string): SsoIdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new SsoIdTokenError("ID token is not a valid JWT");
  }
  try {
    const payload = Buffer.from(parts[1]!, "base64url").toString("utf8");
    return JSON.parse(payload) as SsoIdTokenClaims;
  } catch (err) {
    throw new SsoIdTokenError("ID token payload is not valid JSON", { cause: err });
  }
}

// RBAC stays entirely gateway-side; is_admin here is cosmetic only (see
// AuthContext.tsx's own hasPermission caveat) -- SSO never grants it directly.
export function resolveSsoUser(claims: SsoIdTokenClaims): SessionUser {
  if (typeof claims.email !== "string" || !claims.email) {
    throw new SsoIdTokenError("ID token has no email claim");
  }

  const fullName =
    typeof claims.name === "string"
      ? claims.name
      : typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : null;

  return {
    email: claims.email,
    full_name: fullName,
    is_admin: false,
    is_active: true,
    auth_provider: "sso",
    email_verified: claims.email_verified === true,
    password_change_required: false,
  };
}
