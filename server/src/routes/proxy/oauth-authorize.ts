// Location: ./client/server/src/routes/proxy/oauth-authorize.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Authenticated proxy for the OAuth authorization-code popup's first hop.
//
// src/api/servers.ts's triggerOAuthAuthorization opens this path with a raw
// `window.open` navigation, not through the API client, so it carries no
// Authorization header the way /api/* calls do (find-my-way would otherwise
// never have matched this route at all -- with none registered, it fell
// through to static.ts's SPA-fallback 404 handler, which unconditionally
// serves index.html; see mcp-context-forge#6458). mcpgateway's
// GET /oauth/authorize/{id} requires an authenticated user -- it may run DCR
// registration and DB writes before it 302s to the OAuth provider -- so,
// unlike /oauth/callback, this hop has to be proxied through the BFF, which
// injects the bearer token from the session the same way catch-all.ts does
// for /api/*.
//
// See oauth-callback.ts for the second leg: mcpgateway's own callback
// endpoint, which -- unlike this one -- needs no session and is proxied for
// a different reason (making the browser-facing redirect_uri work when the
// gateway itself isn't independently internet-reachable).
//
// GET is a safe method, so catch-all.ts's csrfIfUnsafe wouldn't cover this
// route even if applied -- and window.open() can't set an X-CSRF-Token
// header anyway. The session cookie is SameSite=Lax (session-store.ts),
// which still rides along on a top-level cross-site navigation, and this
// route is not side-effect-free (DCR registration, DB writes) -- so a
// hostile page could force a logged-in victim's browser into
// window.open(`${victimOrigin}/oauth/authorize/<attacker-chosen-id>`) and
// have it execute with the victim's bearer token. isForbiddenCrossOrigin is
// the same guard login.ts and proxy-sse.ts already use for this exact
// category (cookie-authenticated, can't carry a CSRF token) -- see
// lib/origin-guard.ts.
//
// redirect: "manual" (in forwardOAuthGet) so mcpgateway's 302 Location (the
// OAuth provider's own absolute URL) is forwarded to the browser as-is
// rather than followed server-side -- undici's fetch would otherwise try to
// navigate through it, leaking nothing sensitive but pointlessly making a
// request meant for the browser.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { forwardOAuthGet } from "../../lib/oauth-upstream-forward.js";
import { isForbiddenCrossOrigin } from "../../lib/origin-guard.js";
import { setNoStore } from "../../lib/no-store.js";
import { upstreamAuthHeader } from "../../lib/upstream-auth.js";

interface AuthorizeParams {
  gatewayId: string;
}

export default async function oauthAuthorizeProxyRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: AuthorizeParams }>(
    "/oauth/authorize/:gatewayId",
    { preHandler: fastify.sessionAuth },
    async (request: FastifyRequest<{ Params: AuthorizeParams }>, reply: FastifyReply) => {
      setNoStore(reply);

      if (isForbiddenCrossOrigin(request)) {
        return reply.code(403).send({ error: "cross_site_request_forbidden" });
      }

      const bearerToken = request.session!.bearerToken;
      const queryIndex = request.url.indexOf("?");
      const query = queryIndex === -1 ? "" : request.url.slice(queryIndex);
      const upstreamUrl = `${config.contextforgeUrl}/oauth/authorize/${encodeURIComponent(request.params.gatewayId)}${query}`;

      return forwardOAuthGet(request, reply, upstreamUrl, {
        headers: upstreamAuthHeader(bearerToken),
        timeoutMs: config.oauthProxyTimeoutMs,
        logLabel: "OAuth authorize",
      });
    },
  );
}
