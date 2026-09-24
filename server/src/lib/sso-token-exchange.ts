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
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: config.ssoKeycloakClientId!,
    client_secret: config.ssoKeycloakClientSecret!, // pragma: allowlist secret
    code_verifier: params.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(SSO_TOKEN_EXCHANGE_TIMEOUT_MS),
    });
  } catch (err) {
    throw new SsoTokenExchangeError("Keycloak token request failed", { cause: err });
  }

  if (!response.ok) {
    throw new SsoTokenExchangeError(`Keycloak token endpoint returned ${response.status}`);
  }

  let json: Record<string, unknown>;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    throw new SsoTokenExchangeError("Keycloak token endpoint returned a non-JSON body", {
      cause: err,
    });
  }

  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new SsoTokenExchangeError("Keycloak token response missing access_token");
  }

  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    idToken: typeof json.id_token === "string" ? json.id_token : undefined,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : undefined,
  };
}
