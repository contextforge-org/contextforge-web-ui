// Location: ./client/server/src/routes/proxy/oauth-callback-url.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// GET /oauth/callback-url: tells the SPA where *this* deployment's own
// /oauth/callback proxy is reachable, so OAuth2Auth.tsx can default a new
// gateway's redirect_uri to it instead of leaving the field unset.
//
// Why unset isn't enough on its own: when nothing is stored, mcpgateway's
// own GET /oauth/authorize/{id} defaults redirect_uri to its *own*
// APP_DOMAIN-derived callback (see initiate_oauth_flow /
// _default_redirect_uri in mcp-context-forge's oauth_router.py). That's only
// browser-reachable when the gateway is independently exposed. In the common
// split deployment (only the web UI is public-facing, mcpgateway is not),
// the OAuth provider's redirect then lands on an address nothing answers.
// Defaulting the field to this BFF's own callback proxy instead makes the
// flow work regardless of topology: the provider redirects here, and
// oauth-callback.ts forwards the final hop to mcpgateway server-to-server
// over CONTEXTFORGE_URL, which is reachable by definition.
//
// Uses the same resolvePublicOrigin as origin-guard.ts's CSRF check — not
// window.location.origin — for the identical reason redirect_uri stopped
// being guessed client-side in the first place (mcp-context-forge#6458):
// behind a reverse proxy, the browser's own address isn't reliably this
// deployment's public one.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { resolvePublicOrigin } from "../../lib/origin-guard.js";
import { setNoStore } from "../../lib/no-store.js";

export default async function oauthCallbackUrlRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/oauth/callback-url",
    { preHandler: fastify.sessionAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      setNoStore(reply);
      return reply.send({ redirectUri: `${resolvePublicOrigin(request)}/oauth/callback` });
    },
  );
}
