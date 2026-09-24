// Location: ./client/server/src/routes/auth/sso-callback.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// GET /auth/sso/callback: Keycloak's redirect target. Exchanges the
// authorization code, resolves the user from the ID token, and establishes
// the same cookie session password login uses. See lib/sso-login-state.ts.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { establishSession, PasswordChangeStillRequiredError } from "../../lib/establish-session.js";
import { setNoStore } from "../../lib/no-store.js";
import { getDiscoveryDocument } from "../../lib/oidc-discovery.js";
import { consumeSsoLoginState, SSO_LOGIN_BINDING_COOKIE } from "../../lib/sso-login-state.js";
import { exchangeSsoCode } from "../../lib/sso-token-exchange.js";
import { resolveSsoUser, verifySsoIdToken } from "../../lib/sso-user-resolution.js";

const LOGIN_PATH = "/app/login";

interface SsoCallbackQuerystring {
  code?: string | string[];
  state?: string | string[];
  error?: string | string[];
}

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

// Keycloak's own error codes (access_denied, ...) are short RFC 6749 tokens;
// URLSearchParams encodes whatever we're given either way.
function loginErrorRedirect(code: string): string {
  const url = new URL(LOGIN_PATH, "http://placeholder");
  url.searchParams.set("error", `sso_${code}`);
  return url.pathname + url.search;
}

export default async function ssoCallbackRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: SsoCallbackQuerystring }>(
    "/auth/sso/callback",
    async (
      request: FastifyRequest<{ Querystring: SsoCallbackQuerystring }>,
      reply: FastifyReply,
    ) => {
      setNoStore(reply);

      const binding = request.cookies[SSO_LOGIN_BINDING_COOKIE];
      reply.clearCookie(SSO_LOGIN_BINDING_COOKIE, { path: "/", domain: config.cookieDomain });

      if (!config.ssoEnabled) {
        return reply.redirect(loginErrorRedirect("disabled"));
      }

      const errorParam = firstString(request.query.error);
      if (errorParam) {
        return reply.redirect(loginErrorRedirect(errorParam));
      }

      const code = firstString(request.query.code);
      const state = firstString(request.query.state);
      if (!code || !state) {
        return reply.redirect(loginErrorRedirect("callback_invalid"));
      }

      const loginState = await consumeSsoLoginState(fastify.redis, state, binding);
      if (!loginState) {
        return reply.redirect(loginErrorRedirect("state_invalid"));
      }

      let tokenEndpoint: string;
      try {
        tokenEndpoint = (await getDiscoveryDocument()).tokenEndpoint;
      } catch (err) {
        request.log.error({ err }, "SSO discovery failed");
        return reply.redirect(loginErrorRedirect("discovery_failed"));
      }

      let tokens;
      try {
        tokens = await exchangeSsoCode({
          tokenEndpoint,
          code,
          redirectUri: loginState.redirectUri,
          codeVerifier: loginState.codeVerifier,
        });
      } catch (err) {
        request.log.error({ err }, "SSO token exchange failed");
        return reply.redirect(loginErrorRedirect("token_exchange_failed"));
      }

      if (!tokens.idToken) {
        request.log.error("SSO token response missing id_token");
        return reply.redirect(loginErrorRedirect("id_token_missing"));
      }

      let claims;
      try {
        claims = await verifySsoIdToken(tokens.idToken);
      } catch (err) {
        request.log.error({ err }, "SSO ID token verification failed");
        return reply.redirect(loginErrorRedirect("id_token_invalid"));
      }

      // Confirms this ID token was issued for the authorization request this
      // browser started, not replayed from an unrelated flow.
      if (claims.nonce !== loginState.nonce) {
        request.log.error("SSO ID token nonce mismatch");
        return reply.redirect(loginErrorRedirect("nonce_mismatch"));
      }

      let user;
      try {
        user = resolveSsoUser(claims);
      } catch (err) {
        request.log.error({ err }, "SSO ID token missing required claims");
        return reply.redirect(loginErrorRedirect("email_missing"));
      }

      try {
        await establishSession(
          fastify,
          request,
          reply,
          { access_token: tokens.accessToken, expires_in: tokens.expiresIn, user },
          { refreshToken: tokens.refreshToken, idToken: tokens.idToken },
        );
      } catch (err) {
        // Can't happen -- resolveSsoUser always sets password_change_required
        // false -- but establishSession's own backstop exists for this path.
        if (err instanceof PasswordChangeStillRequiredError) {
          return reply.redirect(loginErrorRedirect("password_change_required"));
        }
        throw err;
      }

      return reply.redirect(loginState.returnTo);
    },
  );
}
