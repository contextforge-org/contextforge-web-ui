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
import { getDiscoveryDocument } from "../../lib/oidc-discovery.js";
import { isForbiddenCrossOrigin, resolvePublicOrigin } from "../../lib/origin-guard.js";
import {
  loginErrorRedirect,
  SSO_DEFAULT_RETURN_TO,
  SSO_LOGIN_PATH,
} from "../../lib/sso-login-error-redirect.js";
import { mintSsoLoginState, SSO_LOGIN_BINDING_COOKIE } from "../../lib/sso-login-state.js";

const APP_PREFIX = "/app";

interface SsoLoginQuerystring {
  next?: string | string[];
}

// Mirrors src/router/index.tsx's validateDestination -- can't import it
// across the package boundary, so reimplemented (vectors shared in tests).
export function safeReturnTo(next: string | string[] | undefined): string {
  // Fastify turns a repeated ?next=a&next=b into an array; treat non-string as absent.
  if (typeof next !== "string" || !next) return SSO_DEFAULT_RETURN_TO;
  if (/[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(next)) return SSO_DEFAULT_RETURN_TO;
  if (next.startsWith("//")) return SSO_DEFAULT_RETURN_TO;

  const [pathname = "", queryString] = next.split("?");
  if (pathname.includes("..")) return SSO_DEFAULT_RETURN_TO;

  const isAppPath = pathname === APP_PREFIX || pathname.startsWith(`${APP_PREFIX}/`);
  if (!isAppPath) return SSO_DEFAULT_RETURN_TO;
  // Mirrors resolveNextParam: never bounce the post-login redirect back to
  // the login page itself.
  if (pathname === SSO_LOGIN_PATH) return SSO_DEFAULT_RETURN_TO;

  return queryString ? `${pathname}?${queryString}` : pathname;
}

export default async function ssoLoginRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: SsoLoginQuerystring }>(
    "/auth/sso/login",
    async (request: FastifyRequest<{ Querystring: SsoLoginQuerystring }>, reply: FastifyReply) => {
      setNoStore(reply);

      const returnTo = safeReturnTo(request.query.next);

      // The only caller is a top-level browser navigation (Login.tsx sets
      // window.location.href), so every failure redirects back to the login
      // page with a `sso_`-prefixed error code instead of rendering raw JSON.
      if (!config.ssoEnabled) {
        return reply.redirect(loginErrorRedirect("disabled", returnTo));
      }

      // Login-CSRF guard only -- no session exists yet to hijack here, and
      // nothing mutates until the callback validates `state`. Same guard
      // login.ts uses for its own unauthenticated entrypoint.
      if (isForbiddenCrossOrigin(request)) {
        return reply.redirect(loginErrorRedirect("cross_site_forbidden", returnTo));
      }

      let authorizationEndpoint: string;
      try {
        authorizationEndpoint = (await getDiscoveryDocument()).authorizationEndpoint;
      } catch (err) {
        // err.message can leak the internal Keycloak URL -- log only, never return it.
        request.log.error({ err }, "SSO discovery failed");
        return reply.redirect(loginErrorRedirect("discovery_failed", returnTo));
      }

      const redirectUri = `${resolvePublicOrigin(request)}/auth/sso/callback`;
      const { state, nonce, codeChallenge, binding } = await mintSsoLoginState(
        fastify.redis,
        returnTo,
        redirectUri,
      );

      const authorizeUrl = new URL(authorizationEndpoint);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", config.ssoKeycloakClientId!);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("scope", config.ssoKeycloakScopes);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", codeChallenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      authorizeUrl.searchParams.set("nonce", nonce);

      // Same attributes as session-store.ts's setSessionCookie -- lax (not
      // strict) so it still rides along on the top-level GET back from Keycloak.
      // One cookie per browser, so concurrent logins in two tabs make the
      // first tab's callback fail its binding check (state_invalid) once the
      // second overwrites it -- accepted trade-off, safer than a
      // multi-binding cookie jar for a login flow that's rare to run twice
      // at once.
      reply.setCookie(SSO_LOGIN_BINDING_COOKIE, binding, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: "lax",
        path: "/",
        domain: config.cookieDomain,
        maxAge: config.ssoLoginStateTtlSeconds,
      });

      return reply.redirect(authorizeUrl.toString());
    },
  );
}
