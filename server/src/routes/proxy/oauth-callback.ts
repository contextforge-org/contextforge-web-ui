// Location: ./client/server/src/routes/proxy/oauth-callback.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Unauthenticated proxy for the OAuth authorization-code popup's second hop.
//
// The OAuth provider redirects the browser here as a top-level navigation
// using whatever `redirect_uri` was registered for the flow. Two cases both
// need this route:
//
//  - A gateway saved before this fix (or one an operator has explicitly
//    pointed at the web UI's own origin) carries `oauth_config.redirect_uri
//    = <web UI origin>/oauth/callback`. Without this route that request fell
//    through to static.ts's SPA-fallback 404 handler -- which unconditionally
//    serves index.html -- landing the popup on a client route the React
//    router doesn't recognize: blank page, no postMessage, stuck forever
//    (observed live against mcp-context-forge#6458's fix).
//  - Even once OAuth2Auth.tsx stops guessing a redirect_uri and the gateway
//    defaults to its own APP_DOMAIN (see oauth-authorize.ts), that default
//    is only browser-reachable if the gateway is independently exposed. In
//    the common split deployment where only the web UI is public-facing,
//    the redirect_uri needs to resolve to *this* origin regardless, with the
//    BFF forwarding the final hop to the gateway server-to-server.
//
// mcpgateway's GET /oauth/callback requires no session -- security comes
// from the HMAC-verified `state` query param, not a cookie -- so this proxy,
// unlike oauth-authorize.ts, injects no bearer token and needs no
// `sessionAuth` preHandler. Its non-popup response path sets a short-lived
// jwt_token/CSRF cookie pair for a legacy "fetch tools" admin button; the
// React SPA always passes popup=true through to /oauth/authorize (see
// src/api/servers.ts), so mcpgateway always takes the popup branch here and
// never emits those cookies through this proxy. Set-Cookie is stripped
// regardless, matching catch-all.ts's rule that mcpgateway's own cookies
// must never reach the browser under the BFF's session-cookie boundary.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { forwardOAuthGet } from "../../lib/oauth-upstream-forward.js";
import { setNoStore } from "../../lib/no-store.js";

export default async function oauthCallbackProxyRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get("/oauth/callback", async (request: FastifyRequest, reply: FastifyReply) => {
    setNoStore(reply);

    const queryIndex = request.url.indexOf("?");
    const query = queryIndex === -1 ? "" : request.url.slice(queryIndex);
    const upstreamUrl = `${config.contextforgeUrl}/oauth/callback${query}`;

    return forwardOAuthGet(request, reply, upstreamUrl, {
      timeoutMs: config.oauthProxyTimeoutMs,
      logLabel: "OAuth callback",
    });
  });
}
