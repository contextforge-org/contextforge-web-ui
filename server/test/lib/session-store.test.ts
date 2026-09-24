// Location: ./client/server/test/lib/session-store.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  createSession,
  deleteSession,
  getSession,
  sessionRedisKey,
  type SessionRecord,
} from "../../src/lib/session-store.js";
import { FakeRedis } from "../helpers/build-app.js";

describe("createSession / getSession", () => {
  it("round-trips a password-login session with no SSO fields", async () => {
    const redis = new FakeRedis();
    const record: SessionRecord = {
      bearerToken: "upstream-jwt", // pragma: allowlist secret
      user: { email: "user@example.com", is_admin: false },
    };

    const sessionId = await createSession(redis, record, 900);
    const stored = await getSession(redis, sessionId);

    expect(stored).toEqual(record);
    // Not just undefined on the JS object -- genuinely absent from what's
    // persisted, since JSON has no way to represent `undefined` (JSON.stringify
    // drops those keys entirely rather than writing them as null).
    const raw = await redis.get(sessionRedisKey(sessionId));
    expect(Object.keys(JSON.parse(raw!) as object)).toEqual(["bearerToken", "user"]);
  });

  it("round-trips an SSO-shaped session (refreshToken/idToken/tokenExpiresAt) through Redis", async () => {
    const redis = new FakeRedis();
    const record: SessionRecord = {
      bearerToken: "keycloak-access-token", // pragma: allowlist secret
      user: { email: "user@example.com", is_admin: false, auth_provider: "sso" },
      refreshToken: "keycloak-refresh-token", // pragma: allowlist secret
      idToken: "keycloak-id-token", // pragma: allowlist secret
      tokenExpiresAt: 1_700_000_000,
    };

    const sessionId = await createSession(redis, record, 900);
    const stored = await getSession(redis, sessionId);

    expect(stored).toEqual(record);
  });

  it("returns null for a session that was never created", async () => {
    const redis = new FakeRedis();

    expect(await getSession(redis, "nonexistent-id")).toBeNull();
  });

  it("returns null for a corrupted Redis value instead of throwing", async () => {
    const redis = new FakeRedis();
    await redis.setex(sessionRedisKey("bad-id"), 900, "not json");

    expect(await getSession(redis, "bad-id")).toBeNull();
  });
});

describe("deleteSession", () => {
  it("removes the session and publishes a revocation event", async () => {
    const redis = new FakeRedis();
    const sessionId = await createSession(
      redis,
      { bearerToken: "t", user: { email: "user@example.com" } }, // pragma: allowlist secret
      900,
    );

    await deleteSession(redis, sessionId);

    expect(await getSession(redis, sessionId)).toBeNull();
    expect(redis.published).toHaveLength(1);
    expect(redis.published[0]?.channel).toContain(sessionId);
  });
});
