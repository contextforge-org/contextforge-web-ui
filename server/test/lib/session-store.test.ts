// Location: ./client/server/test/lib/session-store.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  createSession,
  deleteSession,
  getSession,
  sessionRedisKey,
  updateSessionTokens,
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

describe("updateSessionTokens", () => {
  it("re-persists fresh tokens under the same session id and resets the TTL", async () => {
    const redis = new FakeRedis();
    const sessionId = await createSession(
      redis,
      {
        bearerToken: "old-at", // pragma: allowlist secret
        user: { email: "user@example.com", auth_provider: "sso" },
        refreshToken: "old-rt", // pragma: allowlist secret
        idToken: "old-idt", // pragma: allowlist secret
        tokenExpiresAt: 1_700_000_000,
      },
      900,
    );
    const before = Math.floor(Date.now() / 1000);

    const wrote = await updateSessionTokens(
      redis,
      sessionId,
      { bearerToken: "new-at", refreshToken: "new-rt", idToken: "new-idt" }, // pragma: allowlist secret
      300,
    );

    expect(wrote).toBe(true);
    const stored = await getSession(redis, sessionId);
    expect(stored?.bearerToken).toBe("new-at");
    expect(stored?.refreshToken).toBe("new-rt");
    expect(stored?.idToken).toBe("new-idt");
    expect(stored?.tokenExpiresAt).toBeGreaterThanOrEqual(before + 300);
    expect(stored?.tokenExpiresAt).toBeLessThanOrEqual(before + 305);
    // user (and everything else on the record) is untouched by a token refresh.
    expect(stored?.user).toEqual({ email: "user@example.com", auth_provider: "sso" });
  });

  it("keeps the existing refreshToken/idToken when Keycloak doesn't rotate them", async () => {
    const redis = new FakeRedis();
    const sessionId = await createSession(
      redis,
      {
        bearerToken: "old-at", // pragma: allowlist secret
        user: { email: "user@example.com" },
        refreshToken: "stays-the-same-rt", // pragma: allowlist secret
        idToken: "stays-the-same-idt", // pragma: allowlist secret
      },
      900,
    );

    await updateSessionTokens(redis, sessionId, { bearerToken: "new-at" }, 300); // pragma: allowlist secret

    const stored = await getSession(redis, sessionId);
    expect(stored?.refreshToken).toBe("stays-the-same-rt");
    expect(stored?.idToken).toBe("stays-the-same-idt");
  });

  it("returns false and writes nothing when the session no longer exists", async () => {
    const redis = new FakeRedis();

    const wrote = await updateSessionTokens(
      redis,
      "gone-id",
      { bearerToken: "new-at" }, // pragma: allowlist secret
      300,
    );

    expect(wrote).toBe(false);
    expect(await getSession(redis, "gone-id")).toBeNull();
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
