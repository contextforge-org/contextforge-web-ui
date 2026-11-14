// Location: ./client/server/src/lib/sso-gateway-profile.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// The Keycloak ID token proves who the user is, but the gateway owns the
// role mapping that decides whether they are a platform admin. The BFF's
// session user starts with is_admin=false, which only drives which
// admin-only UI the SPA shows; fetch the gateway's own view after the token
// check so SSO admins see the same Settings tabs as password-login admins.
// Permissions stay enforced gateway-side either way, so a failed lookup
// keeps the existing non-admin fallback rather than failing the login.

import type { FastifyRequest } from "fastify";

import { config } from "../config.js";
import type { SessionUser } from "./session-store.js";
import { upstreamAuthHeader } from "./upstream-auth.js";

const SSO_PROFILE_TIMEOUT_MS = 3000;

interface GatewaySsoProfile {
  full_name?: unknown;
  is_admin?: unknown;
  auth_provider?: unknown;
}

export async function applyGatewaySsoProfile(
  request: FastifyRequest,
  accessToken: string,
  user: SessionUser,
): Promise<SessionUser> {
  let response: Response;
  try {
    response = await fetch(`${config.contextforgeUrl}/auth/email/me`, {
      headers: {
        accept: "application/json",
        ...upstreamAuthHeader(accessToken),
        // Preserve real client IP for upstream audit logging, same as the
        // other gateway calls the BFF makes.
        "x-forwarded-for": request.ip,
        "x-real-ip": request.ip,
      },
      signal: AbortSignal.timeout(SSO_PROFILE_TIMEOUT_MS),
    });
  } catch (err) {
    request.log.warn({ err }, "SSO gateway profile request failed");
    return user;
  }

  if (!response.ok) {
    request.log.warn({ status: response.status }, "SSO gateway profile request rejected");
    return user;
  }

  let profile: GatewaySsoProfile;
  try {
    profile = (await response.json()) as GatewaySsoProfile;
  } catch (err) {
    request.log.warn({ err }, "SSO gateway profile response was not JSON");
    return user;
  }
  if (profile === null || typeof profile !== "object") {
    request.log.warn("SSO gateway profile response was not an object");
    return user;
  }

  return {
    ...user,
    full_name:
      typeof profile.full_name === "string" && profile.full_name.trim()
        ? profile.full_name
        : user.full_name,
    is_admin: typeof profile.is_admin === "boolean" ? profile.is_admin : Boolean(user.is_admin),
    auth_provider:
      typeof profile.auth_provider === "string" && profile.auth_provider
        ? profile.auth_provider
        : user.auth_provider,
  };
}
