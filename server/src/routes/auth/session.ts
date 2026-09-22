// Location: ./client/server/src/routes/auth/session.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// GET /auth/session: SPA bootstrap probe. Never 401s past the network layer
// with a body the app can't use — returns { authenticated: false } for an
// anonymous visitor so the SPA can render a login screen without treating it
// as an error. Also (re)seeds the CSRF cookie, since a page reload needs one
// even mid-session.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { getSession, SESSION_COOKIE_NAME } from "../../lib/session-store.js";
import { setNoStore } from "../../lib/no-store.js";

// Only provider Task 1.1's config supports today -- revisit if a second SSO
// provider is ever added alongside Keycloak.
const SSO_PROVIDER_NAME = "Keycloak";

// Piggybacks on the session-bootstrap call every page load already makes
// (AuthContext), rather than a separate /auth/sso/status fetch -- avoids an
// extra request with no build-time coupling and no SSR.
function ssoFields(): { ssoEnabled: boolean; providerName?: string } {
  return config.ssoEnabled
    ? { ssoEnabled: true, providerName: SSO_PROVIDER_NAME }
    : { ssoEnabled: false };
}

export default async function sessionRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get("/auth/session", async (request: FastifyRequest, reply: FastifyReply) => {
    setNoStore(reply);

    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    const record = sessionId ? await getSession(fastify.redis, sessionId) : null;

    if (!record) {
      return reply.send({ authenticated: false, ...ssoFields() });
    }

    const csrfToken = await reply.generateCsrf();
    return reply.send({ authenticated: true, user: record.user, csrfToken, ...ssoFields() });
  });
}
