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
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SsoTokenRefreshError";
  }
}

export async function refreshSsoSession(params: {
  tokenEndpoint: string;
  refreshToken: string;
}): Promise<SsoTokenRefreshResult> {
  if (!config.ssoEnabled || !config.ssoKeycloakClientId || !config.ssoKeycloakClientSecret) {
    throw new SsoTokenRefreshError("SSO is not configured");
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
    // Keycloak unreachable (network/timeout) -- not necessarily that the
    // refresh token itself is bad. Distinguishable in logs/error handling
    // from the non-2xx branch below, which carries Keycloak's own error code.
    throw new SsoTokenRefreshError("Keycloak token request failed", { cause: err });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new SsoTokenRefreshError(`Keycloak token endpoint returned ${response.status}`, {
        cause: err,
      });
    }
    throw new SsoTokenRefreshError("Keycloak token endpoint returned a non-JSON body", {
      cause: err,
    });
  }

  if (json === null || typeof json !== "object") {
    throw new SsoTokenRefreshError("Keycloak token endpoint returned a non-object JSON body");
  }
  const responseBody = json as Record<string, unknown>;

  if (!response.ok) {
    // Keycloak's own RFC 6749 error code -- invalid_grant means the refresh
    // token was revoked/expired (the caller should give up refreshing and
    // fall back to a full login), distinct from "Keycloak is unreachable" above.
    const errorCode = typeof responseBody.error === "string" ? responseBody.error : "unknown_error";
    throw new SsoTokenRefreshError(
      `Keycloak token endpoint returned ${response.status} (${errorCode})`,
    );
  }

  if (typeof responseBody.access_token !== "string" || !responseBody.access_token) {
    throw new SsoTokenRefreshError("Keycloak token response missing access_token");
  }

  return {
    accessToken: responseBody.access_token,
    refreshToken:
      typeof responseBody.refresh_token === "string" ? responseBody.refresh_token : undefined,
    idToken: typeof responseBody.id_token === "string" ? responseBody.id_token : undefined,
    expiresIn: typeof responseBody.expires_in === "number" ? responseBody.expires_in : undefined,
  };
}
