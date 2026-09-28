// Location: ./client/server/src/lib/sso-user-resolution.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Verifies a Keycloak ID token against the realm's published JWKS and
// decodes its claims into a SessionUser. Used by routes/auth/sso-callback.ts.

import { createPublicKey, verify as verifyJwtSignature } from "node:crypto";
import type { webcrypto } from "node:crypto";

import { config } from "../config.js";
import { getDiscoveryDocument } from "./oidc-discovery.js";
import type { SessionUser } from "./session-store.js";

// SSO_KEYCLOAK_BASE_URL may legitimately be plain http: on a private/Docker
// network (config.ts's own boot validation allows it) -- so unlike a normal
// browser TLS trust boundary, the token endpoint response can't be assumed
// authentic just because it arrived over "a direct server-to-server call".
// The signature must be checked against the realm's own published key.
const JWKS_FETCH_TIMEOUT_MS = 5000;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h, mirrors oidc-discovery.ts's own cache
const CLOCK_SKEW_SECONDS = 60;

export interface SsoIdTokenClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  nonce?: string;
  [key: string]: unknown;
}

export class SsoIdTokenError extends Error {
  // Set only where the callback route needs to react differently by cause
  // (see resolveSsoUser) -- undefined for the generic parse/verify failures.
  readonly code?: "email_missing" | "email_unverified";
  constructor(
    message: string,
    options?: { cause?: unknown; code?: "email_missing" | "email_unverified" },
  ) {
    super(message, options);
    this.name = "SsoIdTokenError";
    this.code = options?.code;
  }
}

interface Jwk {
  kid?: string;
  kty?: string;
  [key: string]: unknown;
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | undefined;
// De-dupes concurrent callers hitting a cold/expired cache, same rationale
// as oidc-discovery.ts's own inFlight guard.
let jwksInFlight: Promise<Jwk[]> | undefined;

async function getJwks(jwksUri: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  if (!jwksInFlight) {
    jwksInFlight = fetchJwks(jwksUri)
      .then((keys) => {
        jwksCache = { keys, fetchedAt: Date.now() };
        return keys;
      })
      .finally(() => {
        jwksInFlight = undefined;
      });
  }
  return jwksInFlight;
}

async function fetchJwks(jwksUri: string): Promise<Jwk[]> {
  let response: Response;
  try {
    response = await fetch(jwksUri, { signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new SsoIdTokenError("Keycloak JWKS request failed", { cause: err });
  }

  if (!response.ok) {
    throw new SsoIdTokenError(`Keycloak JWKS endpoint returned ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new SsoIdTokenError("Keycloak JWKS endpoint returned a non-JSON body", { cause: err });
  }

  if (
    body === null ||
    typeof body !== "object" ||
    !Array.isArray((body as { keys?: unknown }).keys)
  ) {
    throw new SsoIdTokenError("Keycloak JWKS response missing keys array");
  }

  return (body as { keys: Jwk[] }).keys;
}

interface JwtParts {
  headerB64: string;
  payloadB64: string;
  signatureB64: string;
  header: Record<string, unknown>;
  claims: SsoIdTokenClaims;
}

function splitJwt(idToken: string): JwtParts {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new SsoIdTokenError("ID token is not a valid JWT");
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch (err) {
    throw new SsoIdTokenError("ID token header is not valid JSON", { cause: err });
  }

  let claims: SsoIdTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SsoIdTokenClaims;
  } catch (err) {
    throw new SsoIdTokenError("ID token payload is not valid JSON", { cause: err });
  }

  return { headerB64, payloadB64, signatureB64, header, claims };
}

// ponytail: RS256 only (Keycloak's default signing alg). Add ES256 if a
// realm is ever configured for it -- JWT ES256 signatures need the
// ieee-p1363 encoding Node's crypto.verify doesn't default to.
function verifyRs256(
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
  jwk: Jwk,
): boolean {
  if (jwk.kty !== "RSA") return false;
  const publicKey = createPublicKey({
    key: jwk as unknown as webcrypto.JsonWebKey,
    format: "jwk",
  });
  return verifyJwtSignature(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    Buffer.from(signatureB64, "base64url"),
  );
}

function validateClaims(claims: SsoIdTokenClaims, issuer: string, audience: string): void {
  if (claims.iss !== issuer) {
    throw new SsoIdTokenError("ID token iss does not match Keycloak's discovered issuer");
  }

  const aud = claims.aud;
  const audMatches =
    typeof aud === "string" ? aud === audience : Array.isArray(aud) && aud.includes(audience);
  if (!audMatches) {
    throw new SsoIdTokenError("ID token aud does not match this client");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    throw new SsoIdTokenError("ID token has expired");
  }
}

// Verifies signature (via the realm's JWKS), iss, aud, and exp, and returns
// the claims. Does NOT check `nonce` -- only the caller (the callback route)
// knows the value it minted for this specific login attempt.
export async function verifySsoIdToken(idToken: string): Promise<SsoIdTokenClaims> {
  if (!config.ssoEnabled || !config.ssoKeycloakClientId) {
    throw new SsoIdTokenError("SSO is not configured");
  }

  const { headerB64, payloadB64, signatureB64, header, claims } = splitJwt(idToken);

  if (header.alg !== "RS256") {
    throw new SsoIdTokenError(
      `ID token uses unsupported signing algorithm: ${String(header.alg ?? "none")}`,
    );
  }

  const { issuer, jwksUri } = await getDiscoveryDocument();
  const jwks = await getJwks(jwksUri);
  const kid = typeof header.kid === "string" ? header.kid : undefined;
  const jwk = kid ? jwks.find((k) => k.kid === kid) : jwks.length === 1 ? jwks[0] : undefined;
  if (!jwk) {
    throw new SsoIdTokenError("ID token key id not found in Keycloak JWKS");
  }

  let signatureValid: boolean;
  try {
    signatureValid = verifyRs256(headerB64, payloadB64, signatureB64, jwk);
  } catch (err) {
    throw new SsoIdTokenError("ID token key from Keycloak JWKS is malformed", { cause: err });
  }
  if (!signatureValid) {
    throw new SsoIdTokenError("ID token signature verification failed");
  }

  validateClaims(claims, issuer, config.ssoKeycloakClientId);

  return claims;
}

// RBAC stays entirely gateway-side; is_admin here is cosmetic only (see
// AuthContext.tsx's own hasPermission caveat) -- SSO never grants it directly.
export function resolveSsoUser(claims: SsoIdTokenClaims): SessionUser {
  if (typeof claims.email !== "string" || !claims.email) {
    throw new SsoIdTokenError("ID token has no email claim", { code: "email_missing" });
  }
  // An unverified email is federated/self-reported and can collide with an
  // existing account -- trusting it here would let an attacker take over
  // another user's account just by claiming their address at the IdP.
  if (claims.email_verified !== true) {
    throw new SsoIdTokenError("ID token email is not verified", { code: "email_unverified" });
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
    email_verified: true,
    password_change_required: false,
  };
}
