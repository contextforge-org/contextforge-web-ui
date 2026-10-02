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
  clearSessionCookie,
  deleteSession,
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
  if (record.refreshRetryAfter !== undefined && now < record.refreshRetryAfter) return false;
  return record.tokenExpiresAt - config.ssoTokenRefreshLeewaySeconds <= now;
}

// True once the access token's real deadline has passed -- never fudged by
// a retry cooldown. Used to refuse forwarding a dead bearer token upstream.
function isActuallyExpired(record: SessionRecord): boolean {
  return (
    record.tokenExpiresAt !== undefined && record.tokenExpiresAt <= Math.floor(Date.now() / 1000)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Matches catch-all.ts's upstream-401 revocation: a dead session must not
// keep looking "authenticated" to /auth/session for the rest of its TTL.
async function endSession(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionId: string,
): Promise<void> {
  await deleteSession(request.server.redis, sessionId);
  clearSessionCookie(reply);
  reply.code(401).send({ error: "session_expired" });
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
    // Always the session TTL, never the refreshed access token's own
    // expires_in -- otherwise this bug recurs on every refresh cycle.
    const ttlSeconds = config.sessionTtlSeconds;
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
      // Don't touch tokenExpiresAt -- it's the real deadline. refreshRetryAfter
      // just stops every request from re-paying a discovery+refresh timeout
      // during an outage; it never claims an expired token is still valid.
      const retryAfter = Math.floor(Date.now() / 1000) + UNREACHABLE_COOLDOWN_SECONDS;
      const wrote = await updateSessionTokens(
        request.server.redis,
        sessionId,
        {
          bearerToken: record.bearerToken,
          refreshToken: record.refreshToken,
          idToken: record.idToken,
          tokenExpiresAt: record.tokenExpiresAt!,
          refreshRetryAfter: retryAfter,
        },
        config.sessionTtlSeconds,
      );
      if (!wrote) return null;
      const updated = { ...record, refreshRetryAfter: retryAfter };
      return isActuallyExpired(updated) ? null : updated;
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
    if (!needsRefresh(latest)) return latest;

    // Still expired, but a refresh can legitimately take up to
    // REFRESH_LOCK_TTL_MS -- longer than our own wait budget. If the lock
    // is still held, someone's actively working; use the pre-refresh token
    // for this request rather than force-logout a session on track to
    // succeed. Only a vanished lock (holder crashed/released without
    // writing fresh tokens) means the attempt genuinely failed.
    const stillLocked = await request.server.redis.get(lockKey);
    return stillLocked ? latest : null;
  }

  try {
    // Re-read now that the lock is held, rather than reusing the `record`
    // passed in from before the acquire. Without this, a holder who wins
    // the lock right after a prior holder rotated the refresh token would
    // refresh with that now-superseded token and get invalid_grant'd, even
    // though the session is actually fine.
    const fresh = await getSession(request.server.redis, sessionId);
    if (!fresh) return null;
    if (!needsRefresh(fresh)) return fresh;
    return await refreshRecord(request, reply, sessionId, fresh);
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
    record = await refreshRecordWithLock(request, reply, sessionId);
    if (!record) {
      await endSession(request, reply, sessionId);
      return;
    }
  }

  // Never forward a bearer past its real deadline, even if a retry backoff
  // or a still-held lock skipped refreshing it this request.
  if (isActuallyExpired(record)) {
    await endSession(request, reply, sessionId);
    return;
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
