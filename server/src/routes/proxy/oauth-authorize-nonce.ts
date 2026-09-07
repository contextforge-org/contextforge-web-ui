// Location: ./client/server/src/routes/proxy/oauth-authorize-nonce.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// POST /oauth/authorize-nonce: mints the one-time nonce GET
// /oauth/authorize/:gatewayId now requires (see
// lib/oauth-authorize-nonce.ts for the threat this closes). Unlike that
// route, this one isn't a window.open() navigation -- triggerOAuthAuthorization
// (src/api/servers.ts) calls it as an ordinary same-origin fetch through the
// API client first, so it carries both the session cookie and the
// X-CSRF-Token header and fastify.csrfProtection applies exactly as it does
// on every other mutating browser->BFF call.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { mintOAuthAuthorizeNonce } from "../../lib/oauth-authorize-nonce.js";
import { setNoStore } from "../../lib/no-store.js";

export default async function oauthAuthorizeNonceRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/oauth/authorize-nonce",
    { preHandler: [fastify.sessionAuth, fastify.csrfProtection] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      setNoStore(reply);
      const nonce = await mintOAuthAuthorizeNonce(fastify.redis, request.session!.sessionId);
      return reply.send({ nonce });
    },
  );
}
