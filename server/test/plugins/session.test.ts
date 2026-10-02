// Location: ./client/server/test/plugins/session.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import Fastify, { type FastifyInstance } from "fastify";
import { type Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSession } from "../../src/lib/session-store.js";
import cookiePlugin from "../../src/plugins/cookie.js";
import sessionPlugin from "../../src/plugins/session.js";
import { FakeRedis } from "../helpers/build-app.js";

const ENV_KEYS = [
  "SSO_ENABLED",
  "SSO_KEYCLOAK_BASE_URL",
  "SSO_KEYCLOAK_REALM",
  "SSO_KEYCLOAK_CLIENT_ID",
  "SSO_KEYCLOAK_CLIENT_SECRET",
] as const;

const ISSUER = "http://keycloak-internal:8080/realms/mcp-gateway";
const TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

interface TestApp {
  fastify: FastifyInstance;
  redis: FakeRedis;
}

async function buildApp(plugin: typeof sessionPlugin): Promise<TestApp> {
  const fastify = Fastify();
  const redis = new FakeRedis();
  fastify.decorate("redis", redis as unknown as Redis);
  await fastify.register(cookiePlugin);
  await fastify.register(plugin);
  fastify.get("/protected", { preHandler: [fastify.sessionAuth] }, async (request) => ({
    session: request.session,
  }));
  await fastify.ready();
  return { fastify, redis };
}

// config.ts reads SSO_* env vars at import time -- same reset-modules
// pattern as auth.test.ts's withSsoEnabled.
async function withSsoEnabled<T>(run: () => Promise<T>): Promise<T> {
  process.env.SSO_ENABLED = "true";
  process.env.SSO_KEYCLOAK_BASE_URL = "http://keycloak-internal:8080";
  process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
  process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
  process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret
  vi.resetModules();
  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.resetModules();
  }
}

function mockDiscoveryAndRefresh(opts: { refreshOk: boolean; expiresIn?: number }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const href = String(url);
      if (href.startsWith(`${ISSUER}/.well-known`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
            token_endpoint: TOKEN_ENDPOINT,
            jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
          }),
        };
      }
      if (href === TOKEN_ENDPOINT) {
        if (!opts.refreshOk) {
          return { ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "new-access-token", // pragma: allowlist secret
            refresh_token: "new-refresh-token", // pragma: allowlist secret
            expires_in: opts.expiresIn ?? 300,
          }),
        };
      }
      throw new Error(`unexpected fetch url in test: ${href}`);
    }),
  );
}

describe("sessionAuth", () => {
  it("401s unauthenticated with no session cookie", async () => {
    const app = await buildApp(sessionPlugin);

    const response = await app.fastify.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });

  it("401s session_expired for an unknown session id", async () => {
    const app = await buildApp(sessionPlugin);

    const response = await app.fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { cookie: "bff_sid=nonexistent" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "session_expired" });
  });

  it("populates request.session for a valid password-login session", async () => {
    const app = await buildApp(sessionPlugin);
    const sessionId = await createSession(
      app.redis,
      { bearerToken: "upstream-jwt", user: { email: "user@example.com" } }, // pragma: allowlist secret
      900,
    );

    const response = await app.fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { cookie: `bff_sid=${sessionId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session: { sessionId, bearerToken: "upstream-jwt", user: { email: "user@example.com" } },
    });
  });

  it("never attempts a refresh for a password-login session (no refreshToken)", async () => {
    const app = await buildApp(sessionPlugin);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sessionId = await createSession(
      app.redis,
      { bearerToken: "upstream-jwt", user: { email: "user@example.com" } }, // pragma: allowlist secret
      900,
    );

    const response = await app.fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { cookie: `bff_sid=${sessionId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transparently refreshes a near-expiry SSO session and updates the record in place", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession, getSession } =
        await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "old-refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now + 10, // inside the 30s default leeway
        },
        900,
      );
      mockDiscoveryAndRefresh({ refreshOk: true, expiresIn: 300 });

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        session: { sessionId, bearerToken: "new-access-token" },
      });
      const stored = await getSession(app.redis, sessionId);
      expect(stored?.bearerToken).toBe("new-access-token");
      expect(stored?.refreshToken).toBe("new-refresh-token");
      expect(stored?.tokenExpiresAt).toBeGreaterThanOrEqual(now + 300);
    });
  });

  it("re-issues the session cookie with the new TTL on a successful refresh", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession } = await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "old-refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now - 10,
        },
        900, // original cookie's own maxAge, from a much shorter first login
      );
      mockDiscoveryAndRefresh({ refreshOk: true, expiresIn: 300 });

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      // The session TTL (default 86400s), not the refreshed access token's
      // own 300s expires_in -- otherwise the cookie dies at the next access
      // token's expiry again, same bug for a different reason.
      const cookie = response.cookies.find((c) => c.name === "bff_sid");
      expect(cookie?.value).toBe(sessionId);
      expect(cookie?.maxAge).toBe(86400);
    });
  });

  it("locks concurrent refresh attempts so only one Keycloak refresh call happens", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession } = await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "old-refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now - 10,
        },
        900,
      );

      let tokenEndpointCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          const href = String(url);
          if (href.startsWith(`${ISSUER}/.well-known`)) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                issuer: ISSUER,
                authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
                token_endpoint: TOKEN_ENDPOINT,
                jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
              }),
            };
          }
          if (href === TOKEN_ENDPOINT) {
            tokenEndpointCalls += 1;
            // Simulated latency so the second request genuinely finds the
            // lock held, not just wins a race by luck.
            await new Promise((resolve) => setTimeout(resolve, 200));
            return {
              ok: true,
              status: 200,
              json: async () => ({
                access_token: "new-access-token", // pragma: allowlist secret
                refresh_token: "new-refresh-token", // pragma: allowlist secret
                expires_in: 300,
              }),
            };
          }
          throw new Error(`unexpected fetch url in test: ${href}`);
        }),
      );

      const [first, second] = await Promise.all([
        app.fastify.inject({
          method: "GET",
          url: "/protected",
          headers: { cookie: `bff_sid=${sessionId}` },
        }),
        app.fastify.inject({
          method: "GET",
          url: "/protected",
          headers: { cookie: `bff_sid=${sessionId}` },
        }),
      ]);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      // Not 2 -- a single-use/rotating refresh_token would reject the loser
      // of an unlocked race with invalid_grant.
      expect(tokenEndpointCalls).toBe(1);
    });
  });

  it("re-reads the session after acquiring the lock instead of reusing the stale pre-lock record", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession, updateSessionTokens } =
        await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "old-refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now - 10,
        },
        900,
      );
      // Simulate a concurrent request winning the race: by the time this
      // one acquires the (now-free) lock, Redis already holds rotated
      // tokens -- the `record` sessionAuth read before the acquire is
      // stale. Refreshing with its old, already-superseded refreshToken
      // would get invalid_grant'd even though the session is fine.
      await updateSessionTokens(
        app.redis,
        sessionId,
        {
          bearerToken: "new-access-token", // pragma: allowlist secret
          refreshToken: "new-refresh-token", // pragma: allowlist secret
          idToken: "new-id-token", // pragma: allowlist secret
          tokenExpiresAt: now + 300,
        },
        900,
      );
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        session: { sessionId, bearerToken: "new-access-token" },
      });
      // Already fresh once re-read under the lock -- no refresh attempted.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("uses the pre-refresh token when the lock wait times out but the holder is still working", async () => {
    await withSsoEnabled(async () => {
      vi.useFakeTimers();
      try {
        const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
        const { createSession: freshCreateSession, sessionRefreshLockKey } =
          await import("../../src/lib/session-store.js");
        const app = await buildApp(freshSessionPlugin);
        const now = Math.floor(Date.now() / 1000);
        const sessionId = await freshCreateSession(
          app.redis,
          {
            bearerToken: "old-access-token", // pragma: allowlist secret
            user: { email: "user@example.com", auth_provider: "sso" },
            refreshToken: "refresh-token", // pragma: allowlist secret
            idToken: "old-id-token", // pragma: allowlist secret
            tokenExpiresAt: now + 10, // within leeway, not yet actually expired
          },
          900,
        );
        // Simulate another instance holding the refresh lock for the whole
        // wait window -- this request's own SET NX fails immediately, so it
        // polls and times out without ever seeing a completed refresh. The
        // lock itself is still held the whole time (a refresh can
        // legitimately take up to REFRESH_LOCK_TTL_MS, longer than our own
        // REFRESH_LOCK_MAX_WAIT_MS wait budget).
        await app.redis.set(sessionRefreshLockKey(sessionId), "other-holder", "PX", 60_000, "NX");
        vi.stubGlobal("fetch", vi.fn());

        const injectPromise = app.fastify.inject({
          method: "GET",
          url: "/protected",
          headers: { cookie: `bff_sid=${sessionId}` },
        });
        await vi.advanceTimersByTimeAsync(4_000);
        const response = await injectPromise;

        // Someone's still actively refreshing (lock held) -- don't
        // force-logout a session that's on track to succeed just because
        // our own wait budget ran out.
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          session: { sessionId, bearerToken: "old-access-token" },
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("401s when the lock wait times out and the token is already actually expired, even with the lock still held", async () => {
    await withSsoEnabled(async () => {
      vi.useFakeTimers();
      try {
        const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
        const { createSession: freshCreateSession, sessionRefreshLockKey } =
          await import("../../src/lib/session-store.js");
        const app = await buildApp(freshSessionPlugin);
        const now = Math.floor(Date.now() / 1000);
        const sessionId = await freshCreateSession(
          app.redis,
          {
            bearerToken: "old-access-token", // pragma: allowlist secret
            user: { email: "user@example.com", auth_provider: "sso" },
            refreshToken: "refresh-token", // pragma: allowlist secret
            idToken: "old-id-token", // pragma: allowlist secret
            tokenExpiresAt: now - 10, // already past, not just near expiry
          },
          900,
        );
        await app.redis.set(sessionRefreshLockKey(sessionId), "other-holder", "PX", 60_000, "NX");
        vi.stubGlobal("fetch", vi.fn());

        const injectPromise = app.fastify.inject({
          method: "GET",
          url: "/protected",
          headers: { cookie: `bff_sid=${sessionId}` },
        });
        await vi.advanceTimersByTimeAsync(4_000);
        const response = await injectPromise;

        // A held lock means someone's refreshing, not that this bearer is
        // still valid -- never forward a token past its real deadline.
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: "session_expired" });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("forces re-auth when the lock wait times out and the holder is gone without refreshing", async () => {
    await withSsoEnabled(async () => {
      vi.useFakeTimers();
      try {
        const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
        const {
          createSession: freshCreateSession,
          sessionRefreshLockKey,
          getSession,
        } = await import("../../src/lib/session-store.js");
        const app = await buildApp(freshSessionPlugin);
        const now = Math.floor(Date.now() / 1000);
        const sessionId = await freshCreateSession(
          app.redis,
          {
            bearerToken: "old-access-token", // pragma: allowlist secret
            user: { email: "user@example.com", auth_provider: "sso" },
            refreshToken: "refresh-token", // pragma: allowlist secret
            idToken: "old-id-token", // pragma: allowlist secret
            tokenExpiresAt: now - 10,
          },
          900,
        );
        const lockKey = sessionRefreshLockKey(sessionId);
        await app.redis.set(lockKey, "other-holder", "PX", 60_000, "NX");
        vi.stubGlobal("fetch", vi.fn());

        const injectPromise = app.fastify.inject({
          method: "GET",
          url: "/protected",
          headers: { cookie: `bff_sid=${sessionId}` },
        });
        // Let a couple of polls happen, then simulate the holder
        // crashing/releasing without ever writing fresh tokens -- the lock
        // vanishes but the session record is still expired.
        await vi.advanceTimersByTimeAsync(500);
        await app.redis.del(lockKey);
        await vi.advanceTimersByTimeAsync(4_000);
        const response = await injectPromise;

        // The lock is gone and nothing refreshed the session -- the attempt
        // genuinely failed, so this must 401 rather than hand back a token
        // that'll just fail upstream.
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: "session_expired" });
        expect(await getSession(app.redis, sessionId)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("does not attempt a refresh for an SSO session that isn't near expiry", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession } = await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "refresh-token", // pragma: allowlist secret
          idToken: "id-token", // pragma: allowlist secret
          tokenExpiresAt: now + 300,
        },
        900,
      );
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("401s like an unrefreshable session when Keycloak rejects the refresh_token", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession, getSession } =
        await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "revoked-refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now - 10,
        },
        900,
      );
      mockDiscoveryAndRefresh({ refreshOk: false });

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "session_expired" });
      // Not just a 401 response -- the record itself must be gone, or
      // /auth/session keeps reporting authenticated: true for its full TTL.
      expect(await getSession(app.redis, sessionId)).toBeNull();
    });
  });

  it("falls back to the pre-refresh token when the refresh POST itself is unreachable (discovery succeeds)", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession } = await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now + 10, // within leeway, not yet actually expired
        },
        900,
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          const href = String(url);
          if (href.startsWith(`${ISSUER}/.well-known`)) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                issuer: ISSUER,
                authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
                token_endpoint: TOKEN_ENDPOINT,
                jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
              }),
            };
          }
          throw new Error("keycloak token endpoint unreachable");
        }),
      );

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        session: { sessionId, bearerToken: "old-access-token" },
      });
    });
  });

  it("backs off a short window, not an immediate re-trigger, when a refresh response omits expires_in", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession, getSession } =
        await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "old-refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now - 10,
        },
        900,
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          const href = String(url);
          if (href.startsWith(`${ISSUER}/.well-known`)) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                issuer: ISSUER,
                authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
                token_endpoint: TOKEN_ENDPOINT,
                jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
              }),
            };
          }
          if (href === TOKEN_ENDPOINT) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ access_token: "new-access-token" }), // pragma: allowlist secret
            };
          }
          throw new Error(`unexpected fetch url in test: ${href}`);
        }),
      );

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      const stored = await getSession(app.redis, sessionId);
      // Not "now" (storm on every next request) and not sessionTtlSeconds
      // (hours) -- a short, fixed backoff.
      expect(stored?.tokenExpiresAt).toBeGreaterThan(now);
      expect(stored?.tokenExpiresAt).toBeLessThan(now + 120);
    });
  });

  it("falls back to the pre-refresh token (not 401) when discovery is unreachable during a refresh attempt", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession } = await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now + 10, // within leeway, not yet actually expired
        },
        900,
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("keycloak unreachable");
        }),
      );

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      // Unreachable discovery is transient -- says nothing about the
      // refresh token itself, so this request still succeeds.
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        session: { sessionId, bearerToken: "old-access-token" },
      });
    });
  });

  it("401s (not silently served) when an unreachable IdP hits a session that's already actually expired", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession, getSession } =
        await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now - 10, // already past, not just near expiry
        },
        900,
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("keycloak unreachable");
        }),
      );

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      // A transient failure's grace period only covers a token that's still
      // technically valid -- once the real deadline has passed, this must
      // 401 rather than keep forwarding a dead bearer upstream.
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "session_expired" });
      // And the record itself must be gone, or /auth/session keeps
      // reporting authenticated: true for the rest of an outage.
      expect(await getSession(app.redis, sessionId)).toBeNull();
    });
  });

  it("backs off after an unreachable IdP so a second request doesn't re-attempt discovery", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession, getSession } =
        await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await freshCreateSession(
        app.redis,
        {
          bearerToken: "old-access-token", // pragma: allowlist secret
          user: { email: "user@example.com", auth_provider: "sso" },
          refreshToken: "refresh-token", // pragma: allowlist secret
          idToken: "old-id-token", // pragma: allowlist secret
          tokenExpiresAt: now + 10, // within leeway, not yet actually expired
        },
        900,
      );
      const fetchMock = vi.fn(async () => {
        throw new Error("keycloak unreachable");
      });
      vi.stubGlobal("fetch", fetchMock);

      const first = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });
      expect(first.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const stored = await getSession(app.redis, sessionId);
      // Real deadline untouched -- only the retry marker moved.
      expect(stored?.tokenExpiresAt).toBe(now + 10);
      expect(stored?.refreshRetryAfter).toBeGreaterThan(now);

      const second = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });
      expect(second.statusCode).toBe(200);
      // Still inside the cooldown window -- must not pay another discovery
      // round trip during an ongoing outage.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("leaves a password-login session unaffected even when SSO is enabled", async () => {
    await withSsoEnabled(async () => {
      const { default: freshSessionPlugin } = await import("../../src/plugins/session.js");
      const { createSession: freshCreateSession } = await import("../../src/lib/session-store.js");
      const app = await buildApp(freshSessionPlugin);
      const sessionId = await freshCreateSession(
        app.redis,
        { bearerToken: "upstream-jwt", user: { email: "user@example.com" } }, // pragma: allowlist secret
        900,
      );
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await app.fastify.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `bff_sid=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
