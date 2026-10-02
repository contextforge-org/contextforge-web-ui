// Location: ./client/server/src/lib/oidc-discovery.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Fetches and caches Keycloak's OIDC discovery document
// (.well-known/openid-configuration), so the login/callback routes never
// hardcode Keycloak's endpoint URLs.

import { config } from "../config.js";

// Keycloak's own endpoints don't change at runtime; re-fetching on every
// login would just be a wasted round trip.
const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

// A hung discovery fetch must not hold /auth/sso/login open indefinitely --
// same rationale as upstream-login.ts's UPSTREAM_LOGIN_TIMEOUT_MS.
const DISCOVERY_FETCH_TIMEOUT_MS = 5000;

export interface OidcDiscoveryDocument {
  issuer: string;
  // Browser-redirect target -- rewritten to ssoKeycloakPublicBaseUrl when configured.
  authorizationEndpoint: string;
  // Server-to-server only -- rewritten to ssoKeycloakBaseUrl. Not every
  // OIDC provider advertises this.
  endSessionEndpoint?: string;
  // Server-to-server only -- rewritten to ssoKeycloakBaseUrl, never trusted
  // as-discovered (Keycloak reports one hostname for every endpoint).
  tokenEndpoint: string;
  jwksUri: string;
}

export class OidcDiscoveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OidcDiscoveryError";
  }
}

let cached: { document: OidcDiscoveryDocument; fetchedAt: number } | undefined;
// De-dupes concurrent callers hitting a cold/expired cache into one fetch,
// instead of each firing its own request at Keycloak (thundering herd).
let inFlight: Promise<OidcDiscoveryDocument> | undefined;

/**
 * Fetches and caches the discovery document. Throws OidcDiscoveryError on
 * failure -- callers turn that into a clean response, not an unhandled 500.
 */
export async function getDiscoveryDocument(): Promise<OidcDiscoveryDocument> {
  if (cached && Date.now() - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return cached.document;
  }

  if (!inFlight) {
    inFlight = fetchDiscoveryDocument()
      .then((document) => {
        cached = { document, fetchedAt: Date.now() };
        return document;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }

  return inFlight;
}

async function fetchDiscoveryDocument(): Promise<OidcDiscoveryDocument> {
  if (!config.ssoEnabled || !config.ssoKeycloakBaseUrl || !config.ssoKeycloakRealm) {
    throw new OidcDiscoveryError("SSO is not configured (missing Keycloak base URL or realm)");
  }

  const url = `${config.ssoKeycloakBaseUrl}/realms/${encodeURIComponent(config.ssoKeycloakRealm)}/.well-known/openid-configuration`;

  let response: Response;
  try {
    // AbortSignal.timeout() needs Node >=17.3; .nvmrc/package.json pin >=22.
    response = await fetch(url, { signal: AbortSignal.timeout(DISCOVERY_FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new OidcDiscoveryError(`Keycloak discovery request failed: ${url}`, { cause: err });
  }

  if (!response.ok) {
    throw new OidcDiscoveryError(`Keycloak discovery returned ${response.status} for ${url}`);
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    throw new OidcDiscoveryError(`Keycloak discovery returned a non-JSON body: ${url}`, {
      cause: err,
    });
  }

  // Keycloak's issuer reflects its own configured hostname, not the address
  // the BFF dials to reach it -- the two commonly differ (KC_HOSTNAME, a
  // reverse proxy). mcp-context-forge's own sso_service.py treats the
  // discovered issuer as authoritative rather than cross-checking it against
  // config, and this file follows that same trust model.
  const issuer = requireStringField(body, "issuer", url);
  const authorizationEndpoint = requireStringField(body, "authorization_endpoint", url);
  const tokenEndpoint = requireStringField(body, "token_endpoint", url);
  const jwksUri = requireStringField(body, "jwks_uri", url);
  const endSessionEndpoint = optionalStringField(body, "end_session_endpoint");

  return {
    issuer,
    authorizationEndpoint: rewriteBaseUrl(
      authorizationEndpoint,
      config.ssoKeycloakPublicBaseUrl,
      "authorization_endpoint",
    ),
    tokenEndpoint: rewriteBaseUrl(tokenEndpoint, config.ssoKeycloakBaseUrl, "token_endpoint"),
    jwksUri: rewriteBaseUrl(jwksUri, config.ssoKeycloakBaseUrl, "jwks_uri"),
    endSessionEndpoint:
      endSessionEndpoint &&
      rewriteBaseUrl(endSessionEndpoint, config.ssoKeycloakBaseUrl, "end_session_endpoint"),
  };
}

function requireStringField(body: Record<string, unknown>, field: string, url: string): string {
  const value = optionalStringField(body, field);
  if (!value) {
    throw new OidcDiscoveryError(`Keycloak discovery document missing "${field}": ${url}`);
  }
  return value;
}

function optionalStringField(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  return typeof value === "string" && value ? value : undefined;
}

// Swaps only scheme+host+port to targetBase, keeping the discovered path.
function rewriteBaseUrl(
  endpoint: string,
  targetBase: string | undefined,
  fieldName: string,
): string {
  if (!targetBase) return endpoint;
  try {
    const target = new URL(targetBase);
    const rewritten = new URL(endpoint);
    rewritten.protocol = target.protocol;
    rewritten.host = target.host; // host includes port
    return rewritten.toString();
  } catch (err) {
    throw new OidcDiscoveryError(
      `Keycloak discovery returned a malformed ${fieldName}: "${endpoint}"`,
      { cause: err },
    );
  }
}
