// Location: ./client/server/test/lib/establish-session.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Exercises establishSession() directly through a minimal Fastify app (real
// cookie + CSRF plugins, fake Redis) rather than through a specific route, so
// this stays the one place both callers' shared TTL/CSRF/SSO-field behavior
// is pinned -- routes/auth/login.ts and routes/auth/sso-callback.ts each only
// need their own route-shaped tests on top of this.

import Fastify, { type FastifyInstance } from "fastify";
import { type Redis } from "ioredis";
import { describe, expect, it } from "vitest";

import cookiePlugin from "../../src/plugins/cookie.js";
import csrfPlugin from "../../src/plugins/csrf.js";
import {
  establishSession,
  PasswordChangeStillRequiredError,
  type SsoTokens,
  type UpstreamAuthenticationResponse,
} from "../../src/lib/establish-session.js";
import { config } from "../../src/config.js";
import { getSession, sessionRedisKey } from "../../src/lib/session-store.js";
import { FakeRedis } from "../helpers/build-app.js";

interface TestApp {
  fastify: FastifyInstance;
  redis: FakeRedis;
}

async function buildEstablishSessionTestApp(): Promise<TestApp> {
  const fastify = Fastify();
  const redis = new FakeRedis();
  fastify.decorate("redis", redis as unknown as Redis);

  await fastify.register(cookiePlugin);
  await fastify.register(csrfPlugin);

  fastify.post<{ Body: { auth: UpstreamAuthenticationResponse; ssoTokens?: SsoTokens } }>( // pragma: allowlist secret
    "/test/establish-session",
    async (request, reply) => {
      try {
        return await establishSession(
          fastify,
          request,
          reply,
          request.body.auth,
          request.body.ssoTokens,
        );
      } catch (err) {
        if (err instanceof PasswordChangeStillRequiredError) {
          return reply.code(409).send({ error: "password_change_required" });
        }
        throw err;
      }
    },
  );

  await fastify.ready();
  return { fastify, redis };
}

describe("establishSession", () => {
  it("persists a password-login session with no SSO fields in Redis", async () => {
    const app = await buildEstablishSessionTestApp();
    const response = await app.fastify.inject({
      method: "POST",
      url: "/test/establish-session",
      payload: {
        auth: {
          access_token: "upstream-jwt", // pragma: allowlist secret
          expires_in: 1200,
          user: { email: "user@example.com", is_admin: false },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const sessionId = response.cookies.find((c) => c.name === "bff_sid")?.value;
    const stored = await getSession(app.redis, sessionId!);

    expect(stored?.refreshToken).toBeUndefined();
    expect(stored?.idToken).toBeUndefined();
    expect(stored?.tokenExpiresAt).toBeUndefined();
    const raw = await app.redis.get(sessionRedisKey(sessionId!));
    expect(Object.keys(JSON.parse(raw!) as object)).toEqual(["bearerToken", "user"]);
  });

  it("persists an SSO-shaped session with refreshToken/idToken/tokenExpiresAt in Redis", async () => {
    const app = await buildEstablishSessionTestApp();
    const before = Math.floor(Date.now() / 1000);

    const response = await app.fastify.inject({
      method: "POST",
      url: "/test/establish-session",
      payload: {
        auth: {
          access_token: "keycloak-access-token", // pragma: allowlist secret
          expires_in: 300,
          user: { email: "user@example.com", is_admin: false, auth_provider: "sso" },
        },
        ssoTokens: {
          refreshToken: "keycloak-refresh-token", // pragma: allowlist secret
          idToken: "keycloak-id-token", // pragma: allowlist secret
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const sessionId = response.cookies.find((c) => c.name === "bff_sid")?.value;
    const stored = await getSession(app.redis, sessionId!);

    expect(stored?.refreshToken).toBe("keycloak-refresh-token");
    expect(stored?.idToken).toBe("keycloak-id-token");
    // tokenExpiresAt is derived from the session TTL (expires_in), computed
    // at call time -- assert it landed in the expected window rather than an
    // exact value.
    expect(stored?.tokenExpiresAt).toBeGreaterThanOrEqual(before + 300);
    expect(stored?.tokenExpiresAt).toBeLessThanOrEqual(before + 300 + 5);
  });

  it("uses the upstream token's own expires_in as the session TTL, not the BFF default", async () => {
    const app = await buildEstablishSessionTestApp();
    const response = await app.fastify.inject({
      method: "POST",
      url: "/test/establish-session",
      payload: {
        auth: {
          access_token: "upstream-jwt", // pragma: allowlist secret
          expires_in: 1200,
          user: { email: "user@example.com" },
        },
      },
    });

    const sessionCookie = response.cookies.find((c) => c.name === "bff_sid");
    expect(sessionCookie?.maxAge).toBe(1200);
  });

  it("falls back to the BFF default TTL when expires_in is absent or invalid", async () => {
    const app = await buildEstablishSessionTestApp();
    const response = await app.fastify.inject({
      method: "POST",
      url: "/test/establish-session",
      payload: {
        auth: {
          access_token: "upstream-jwt", // pragma: allowlist secret
          expires_in: -5,
          user: { email: "user@example.com" },
        },
      },
    });

    const sessionCookie = response.cookies.find((c) => c.name === "bff_sid");
    expect(sessionCookie?.maxAge).toBe(config.sessionTtlSeconds);
  });

  it("throws PasswordChangeStillRequiredError instead of minting a session", async () => {
    const app = await buildEstablishSessionTestApp();
    const response = await app.fastify.inject({
      method: "POST",
      url: "/test/establish-session",
      payload: {
        auth: {
          access_token: "upstream-jwt", // pragma: allowlist secret
          user: { email: "user@example.com", password_change_required: true },
        },
      },
    });

    expect(response.statusCode).toBe(409);
    const sessionCookie = response.cookies.find((c) => c.name === "bff_sid");
    expect(sessionCookie).toBeUndefined();
  });

  it("rotates the CSRF secret even if the request already carries one", async () => {
    const app = await buildEstablishSessionTestApp();
    const first = await app.fastify.inject({
      method: "POST",
      url: "/test/establish-session",
      payload: {
        auth: { access_token: "upstream-jwt", user: { email: "user@example.com" } }, // pragma: allowlist secret
      },
    });
    const firstCsrfToken = first.json().csrfToken as string;
    const priorCookies = first.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const second = await app.fastify.inject({
      method: "POST",
      url: "/test/establish-session",
      headers: { cookie: priorCookies },
      payload: {
        auth: { access_token: "upstream-jwt-2", user: { email: "user@example.com" } }, // pragma: allowlist secret
      },
    });
    const secondCsrfToken = second.json().csrfToken as string;

    expect(secondCsrfToken).not.toBe(firstCsrfToken);
  });
});
