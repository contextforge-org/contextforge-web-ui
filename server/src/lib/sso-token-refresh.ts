// Location: ./client/server/src/lib/sso-token-refresh.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Refreshes a Keycloak-issued access token via the refresh_token grant, so a
// session doesn't have to re-run the full browser redirect flow just because
// its access token expired. Used by plugins/session.ts's sessionAuth.

import { config } from "../config.js";

const SSO_TOKEN_REFRESH_TIMEOUT_MS = 5000;

export interface SsoTokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

export class SsoTokenRefreshError extends Error {
  // "rejected" = Keycloak said no (4xx, dead token). "unreachable" =
  // network/timeout/5xx/malformed -- the refresh token may still be fine.
  readonly code: "rejected" | "unreachable";
  constructor(message: string, code: "rejected" | "unreachable", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SsoTokenRefreshError";
    this.code = code;
  }
}

export async function refreshSsoSession(params: {
  tokenEndpoint: string;
  refreshToken: string;
}): Promise<SsoTokenRefreshResult> {
  if (!config.ssoEnabled || !config.ssoKeycloakClientId || !config.ssoKeycloakClientSecret) {
    throw new SsoTokenRefreshError("SSO is not configured", "unreachable");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: config.ssoKeycloakClientId,
    client_secret: config.ssoKeycloakClientSecret, // pragma: allowlist secret
  });

  let response: Response;
  try {
    response = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(SSO_TOKEN_REFRESH_TIMEOUT_MS),
      // A redirect here would re-send client_secret and the refresh token
      // itself to wherever it points.
      redirect: "error",
    });
  } catch (err) {
    // Network/timeout -- not necessarily that the refresh token is bad,
    // distinct from the non-2xx branch below (Keycloak's own error code).
    throw new SsoTokenRefreshError("Keycloak token request failed", "unreachable", { cause: err });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new SsoTokenRefreshError(
        `Keycloak token endpoint returned ${response.status}`,
        "unreachable",
        { cause: err },
      );
    }
    throw new SsoTokenRefreshError(
      "Keycloak token endpoint returned a non-JSON body",
      "unreachable",
      { cause: err },
    );
  }

  if (json === null || typeof json !== "object") {
    throw new SsoTokenRefreshError(
      "Keycloak token endpoint returned a non-object JSON body",
      "unreachable",
    );
  }
  const responseBody = json as Record<string, unknown>;

  if (!response.ok) {
    // Keycloak's own RFC 6749 error code is the actual verdict on the
    // token, not the HTTP status class -- a 4xx can be rate-limiting
    // (429), a desynced client_secret (invalid_client), or a momentary
    // temporarily_unavailable, none of which say the refresh token itself
    // is dead. Only invalid_grant does. Treating every 4xx as "rejected"
    // would log a user out over conditions that clear on their own.
    const errorCode = typeof responseBody.error === "string" ? responseBody.error : "unknown_error";
    const code = errorCode === "invalid_grant" ? "rejected" : "unreachable";
    throw new SsoTokenRefreshError(
      `Keycloak token endpoint returned ${response.status} (${errorCode})`,
      code,
    );
  }

  if (typeof responseBody.access_token !== "string" || !responseBody.access_token) {
    throw new SsoTokenRefreshError("Keycloak token response missing access_token", "unreachable");
  }

  return {
    accessToken: responseBody.access_token,
    refreshToken:
      typeof responseBody.refresh_token === "string" ? responseBody.refresh_token : undefined,
    idToken: typeof responseBody.id_token === "string" ? responseBody.id_token : undefined,
    expiresIn: typeof responseBody.expires_in === "number" ? responseBody.expires_in : undefined,
  };
}
