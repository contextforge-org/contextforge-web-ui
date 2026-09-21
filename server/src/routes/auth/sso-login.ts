// Location: ./client/server/src/routes/auth/sso-login.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// GET /auth/sso/login: starts the BFF's own PKCE authorization-code flow
// against Keycloak, redirecting the browser to its authorization endpoint.
// See lib/oidc-discovery.ts and lib/sso-login-state.ts.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { setNoStore } from "../../lib/no-store.js";
import { getDiscoveryDocument, OidcDiscoveryError } from "../../lib/oidc-discovery.js";
import { isForbiddenCrossOrigin, resolvePublicOrigin } from "../../lib/origin-guard.js";
import { mintSsoLoginState } from "../../lib/sso-login-state.js";

const APP_PREFIX = "/app";
const DEFAULT_RETURN_TO = `${APP_PREFIX}/`;

interface SsoLoginQuerystring {
  next?: string;
}

// Mirrors src/router/index.tsx's validateDestination -- can't import it (a
// different package/tsconfig), so the same open-redirect rules are
// reimplemented here for the one param this route reads off the query string.
function safeReturnTo(next: string | undefined): string {
  if (!next) return DEFAULT_RETURN_TO;
  if (/[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(next)) return DEFAULT_RETURN_TO;
  if (next.startsWith("//")) return DEFAULT_RETURN_TO;

  const [pathname = "", queryString] = next.split("?");
  if (pathname.includes("..")) return DEFAULT_RETURN_TO;

  const isAppPath = pathname === APP_PREFIX || pathname.startsWith(`${APP_PREFIX}/`);
  if (!isAppPath) return DEFAULT_RETURN_TO;

  return queryString ? `${pathname}?${queryString}` : pathname;
}

export default async function ssoLoginRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: SsoLoginQuerystring }>(
    "/auth/sso/login",
    async (request: FastifyRequest<{ Querystring: SsoLoginQuerystring }>, reply: FastifyReply) => {
      setNoStore(reply);

      if (!config.ssoEnabled) {
        return reply.code(404).send({ error: "sso_disabled" });
      }

      // Login-CSRF guard only -- no session exists yet to hijack here, and
      // nothing mutates until the callback validates `state`. Same guard
      // login.ts uses for its own unauthenticated entrypoint.
      if (isForbiddenCrossOrigin(request)) {
        return reply.code(403).send({ error: "cross_site_request_forbidden" });
      }

      let authorizationEndpoint: string;
      try {
        authorizationEndpoint = (await getDiscoveryDocument()).authorizationEndpoint;
      } catch (err) {
        request.log.error({ err }, "SSO discovery failed");
        return reply.code(502).send({
          error: "sso_discovery_failed",
          detail: err instanceof OidcDiscoveryError ? err.message : undefined,
        });
      }

      const returnTo = safeReturnTo(request.query.next);
      const { state, nonce, codeChallenge } = await mintSsoLoginState(fastify.redis, returnTo);

      const authorizeUrl = new URL(authorizationEndpoint);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", config.ssoKeycloakClientId!);
      authorizeUrl.searchParams.set(
        "redirect_uri",
        `${resolvePublicOrigin(request)}/auth/sso/callback`,
      );
      authorizeUrl.searchParams.set("scope", config.ssoKeycloakScopes);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", codeChallenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      authorizeUrl.searchParams.set("nonce", nonce);

      return reply.redirect(authorizeUrl.toString());
    },
  );
}
