// Location: ./client/server/src/lib/sso-token-exchange.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Exchanges an authorization code for tokens at Keycloak's token endpoint.
// Used by routes/auth/sso-callback.ts.

import { config } from "../config.js";

const SSO_TOKEN_EXCHANGE_TIMEOUT_MS = 5000;

export interface SsoTokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

export class SsoTokenExchangeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SsoTokenExchangeError";
  }
}

export async function exchangeSsoCode(params: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<SsoTokenExchangeResult> {
  if (!config.ssoEnabled || !config.ssoKeycloakClientId || !config.ssoKeycloakClientSecret) {
    throw new SsoTokenExchangeError("SSO is not configured");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: config.ssoKeycloakClientId,
    client_secret: config.ssoKeycloakClientSecret, // pragma: allowlist secret
    code_verifier: params.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(SSO_TOKEN_EXCHANGE_TIMEOUT_MS),
      // A redirect here would re-send client_secret to wherever it points.
      redirect: "error",
    });
  } catch (err) {
    throw new SsoTokenExchangeError("Keycloak token request failed", { cause: err });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new SsoTokenExchangeError(`Keycloak token endpoint returned ${response.status}`, {
        cause: err,
      });
    }
    throw new SsoTokenExchangeError("Keycloak token endpoint returned a non-JSON body", {
      cause: err,
    });
  }

  if (json === null || typeof json !== "object") {
    throw new SsoTokenExchangeError("Keycloak token endpoint returned a non-object JSON body");
  }
  const responseBody = json as Record<string, unknown>;

  if (!response.ok) {
    // Keycloak's own RFC 6749 error code (invalid_grant, invalid_client, ...)
    // -- distinguishes a stale code from a bad secret in logs, without
    // leaking the token endpoint URL itself.
    const errorCode = typeof responseBody.error === "string" ? responseBody.error : "unknown_error";
    throw new SsoTokenExchangeError(
      `Keycloak token endpoint returned ${response.status} (${errorCode})`,
    );
  }

  if (typeof responseBody.access_token !== "string" || !responseBody.access_token) {
    throw new SsoTokenExchangeError("Keycloak token response missing access_token");
  }

  return {
    accessToken: responseBody.access_token,
    refreshToken:
      typeof responseBody.refresh_token === "string" ? responseBody.refresh_token : undefined,
    idToken: typeof responseBody.id_token === "string" ? responseBody.id_token : undefined,
    expiresIn: typeof responseBody.expires_in === "number" ? responseBody.expires_in : undefined,
  };
}
