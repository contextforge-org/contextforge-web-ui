// Location: ./client/server/src/lib/sso-back-channel-logout.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Best-effort RP-Initiated Logout (OIDC) against Keycloak's
// end_session_endpoint, so logging out of the BFF also invalidates the
// Keycloak refresh_token/IdP session an SSO session's tokens came from.
// Mirrors revoke-upstream-token.ts's "must not block the response"
// convention. Used by routes/auth/logout.ts.

import type { FastifyRequest } from "fastify";

import { getDiscoveryDocument } from "./oidc-discovery.js";

// Caller (the logout response) is waiting on this -- cap how long a hung
// (not refused) Keycloak can hold it open.
const SSO_BACK_CHANNEL_LOGOUT_TIMEOUT_MS = 3000;

export async function backChannelLogoutSso(
  request: FastifyRequest,
  idToken: string,
): Promise<void> {
  let endSessionEndpoint: string | undefined;
  try {
    ({ endSessionEndpoint } = await getDiscoveryDocument());
  } catch (err) {
    request.log.warn({ err }, "SSO back-channel logout: discovery failed");
    return;
  }
  // Not every realm/provider advertises one (see oidc-discovery.ts) -- nothing to call.
  if (!endSessionEndpoint) return;

  const url = new URL(endSessionEndpoint);
  url.searchParams.set("id_token_hint", idToken);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(SSO_BACK_CHANNEL_LOGOUT_TIMEOUT_MS),
    });
    if (!response.ok) {
      request.log.warn(
        { status: response.status },
        "SSO back-channel logout returned a non-2xx status",
      );
    }
  } catch (err) {
    request.log.warn({ err }, "SSO back-channel logout failed");
  }
}
