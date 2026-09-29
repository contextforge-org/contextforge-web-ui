// Location: ./client/server/src/plugins/session.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Decorates fastify with `sessionAuth`, a preHandler that resolves the
// session_id cookie against Redis and populates request.session. Applied
// per-route (proxy/auth/SSE), not globally — SSE routes need different CSRF
// treatment, and /healthz and /auth/login must stay unauthenticated.

import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { config } from "../config.js";
import { getDiscoveryDocument, OidcDiscoveryError } from "../lib/oidc-discovery.js";
import {
  getSession,
  sessionRefreshLockKey,
  setSessionCookie,
  SESSION_COOKIE_NAME,
  updateSessionTokens,
  type SessionRecord,
} from "../lib/session-store.js";
import { refreshSsoSession, SsoTokenRefreshError } from "../lib/sso-token-refresh.js";

// Missing expires_in on a refresh isn't "already expired" -- that would
// retry every request (a storm). Back off a short window instead.
const SSO_TOKEN_REFRESH_FALLBACK_SECONDS = 60;

// Covers the worst-case refresh round trip (discovery fetch + token refresh
// + DB write) so an abandoned lock (crashed holder) self-clears promptly.
const REFRESH_LOCK_TTL_MS = 12_000;
const REFRESH_LOCK_POLL_MS = 100;
const REFRESH_LOCK_MAX_WAIT_MS = 3_000;

// Compare-and-delete: only release a lock this holder itself acquired. An
// unconditional DEL would let a second holder's lock (acquired after this
// one's PX TTL auto-expired while this holder's own refresh ran long) be
// deleted by this holder's delayed `finally`, opening a window for a third
// holder to race a concurrent refresh_token grant against the same rotating
// token.
const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// Short backoff after a confirmed-unreachable IdP so every request during an
// outage doesn't each pay a fresh discovery+refresh round trip.
const UNREACHABLE_COOLDOWN_SECONDS = 5;

function needsRefresh(record: SessionRecord): boolean {
  if (!record.refreshToken || record.tokenExpiresAt === undefined) return false;
  const now = Math.floor(Date.now() / 1000);
  return record.tokenExpiresAt - config.ssoTokenRefreshLeewaySeconds <= now;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// null only for a definite failure (rejected token, session gone). A
// transient failure returns the ORIGINAL record so this request still works.
async function refreshRecord(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionId: string,
  record: SessionRecord,
): Promise<SessionRecord | null> {
  try {
    const { tokenEndpoint } = await getDiscoveryDocument();
    const tokens = await refreshSsoSession({
      tokenEndpoint,
      refreshToken: record.refreshToken!,
    });

    const validExpiresIn = tokens.expiresIn && tokens.expiresIn > 0 ? tokens.expiresIn : undefined;
    const ttlSeconds = validExpiresIn ?? config.sessionTtlSeconds;
    const tokenExpiresAt =
      Math.floor(Date.now() / 1000) + (validExpiresIn ?? SSO_TOKEN_REFRESH_FALLBACK_SECONDS);

    const wrote = await updateSessionTokens(
      request.server.redis,
      sessionId,
      {
        bearerToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        tokenExpiresAt,
      },
      ttlSeconds,
    );
    if (!wrote) return null;

    // Without this, the cookie keeps the *original* login's maxAge and the
    // browser drops it once that elapses, even with Redis kept fresh.
    setSessionCookie(reply, sessionId, ttlSeconds);

    return {
      ...record,
      bearerToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? record.refreshToken,
      idToken: tokens.idToken ?? record.idToken,
      tokenExpiresAt,
    };
  } catch (err) {
    const isTransient =
      (err instanceof SsoTokenRefreshError && err.code === "unreachable") ||
      err instanceof OidcDiscoveryError;
    if (isTransient) {
      request.log.warn({ err }, "SSO token refresh unreachable -- using pre-refresh token");
      // Persist a short cooldown so every request during an outage doesn't
      // each retrigger discovery+refresh; without this, needsRefresh() stays
      // true on the unchanged tokenExpiresAt and every subsequent request
      // pays the full timeout again until Keycloak recovers. needsRefresh()
      // fires whenever tokenExpiresAt is within the leeway window, so the
      // cooldown has to clear that leeway too, not just add a few seconds
      // to the (already-passed) real expiry.
      const cooldownExpiresAt =
        Math.floor(Date.now() / 1000) +
        config.ssoTokenRefreshLeewaySeconds +
        UNREACHABLE_COOLDOWN_SECONDS;
      const wrote = await updateSessionTokens(
        request.server.redis,
        sessionId,
        {
          bearerToken: record.bearerToken,
          refreshToken: record.refreshToken,
          idToken: record.idToken,
          tokenExpiresAt: cooldownExpiresAt,
        },
        config.sessionTtlSeconds,
      );
      if (!wrote) return null;
      return { ...record, tokenExpiresAt: cooldownExpiresAt };
    }
    request.log.warn({ err }, "SSO token refresh failed");
    return null;
  }
}

// Redis-locked so concurrent requests near expiry don't each race their own
// refresh_token grant -- rotating tokens would reject all but the first.
async function refreshRecordWithLock(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionId: string,
  record: SessionRecord,
): Promise<SessionRecord | null> {
  const lockKey = sessionRefreshLockKey(sessionId);
  const lockToken = randomUUID();
  const acquired = await request.server.redis.set(
    lockKey,
    lockToken,
    "PX",
    REFRESH_LOCK_TTL_MS,
    "NX",
  );

  if (!acquired) {
    const deadline = Date.now() + REFRESH_LOCK_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await delay(REFRESH_LOCK_POLL_MS);
      const current = await getSession(request.server.redis, sessionId);
      if (!current) return null;
      if (!needsRefresh(current)) return current;
    }
    // Gave up waiting on the lock holder. Re-check rather than trust the
    // pre-refresh record blindly -- if it's still expired, force re-auth
    // instead of handing back a token that'll just 401 upstream.
    request.log.warn({ sessionId }, "SSO token refresh lock wait timed out");
    const latest = await getSession(request.server.redis, sessionId);
    if (!latest) return null;
    return needsRefresh(latest) ? null : latest;
  }

  try {
    return await refreshRecord(request, reply, sessionId, record);
  } finally {
    await request.server.redis.eval(UNLOCK_SCRIPT, 1, lockKey, lockToken);
  }
}

async function sessionAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  let record = await getSession(request.server.redis, sessionId);
  if (!record) {
    reply.code(401).send({ error: "session_expired" });
    return;
  }

  if (needsRefresh(record)) {
    record = await refreshRecordWithLock(request, reply, sessionId, record);
    if (!record) {
      reply.code(401).send({ error: "session_expired" });
      return;
    }
  }

  request.session = { sessionId, bearerToken: record.bearerToken, user: record.user };
}

export default fp(
  async function sessionPlugin(fastify: FastifyInstance) {
    fastify.decorate("sessionAuth", sessionAuth);
  },
  { name: "sessionPlugin" },
);

declare module "fastify" {
  interface FastifyInstance {
    sessionAuth: typeof sessionAuth; // pragma: allowlist secret
  }
}
