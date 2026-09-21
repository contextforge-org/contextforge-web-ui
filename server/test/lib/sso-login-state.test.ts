// Location: ./client/server/test/lib/sso-login-state.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { config } from "../../src/config.js";
import { consumeSsoLoginState, mintSsoLoginState } from "../../src/lib/sso-login-state.js";
import { FakeRedis } from "../helpers/build-app.js";

describe("mintSsoLoginState / consumeSsoLoginState", () => {
  it("mints a state/nonce/codeChallenge derived from a fresh PKCE verifier", async () => {
    const redis = new FakeRedis();

    const minted = await mintSsoLoginState(redis as never, "/app/tools");

    expect(minted.state).toBeTruthy();
    expect(minted.nonce).toBeTruthy();
    expect(minted.state).not.toBe(minted.nonce);

    const record = await consumeSsoLoginState(redis as never, minted.state);
    expect(record).not.toBeNull();
    const expectedChallenge = createHash("sha256").update(record!.codeVerifier).digest("base64url");
    expect(minted.codeChallenge).toBe(expectedChallenge);
    expect(record!.nonce).toBe(minted.nonce);
    expect(record!.returnTo).toBe("/app/tools");
  });

  it("consumes the state exactly once -- a second consume returns null", async () => {
    const redis = new FakeRedis();
    const { state } = await mintSsoLoginState(redis as never, "/app/");

    expect(await consumeSsoLoginState(redis as never, state)).not.toBeNull();
    expect(await consumeSsoLoginState(redis as never, state)).toBeNull();
  });

  it("returns null for an undefined or unknown state", async () => {
    const redis = new FakeRedis();

    expect(await consumeSsoLoginState(redis as never, undefined)).toBeNull();
    expect(await consumeSsoLoginState(redis as never, "unknown-state")).toBeNull();
  });

  it("stores the record with the configured TTL", async () => {
    const redis = new FakeRedis();
    const setexSpy = vi.spyOn(redis, "setex");

    await mintSsoLoginState(redis as never, "/app/");

    expect(setexSpy).toHaveBeenCalledWith(
      expect.stringContaining("sso-login-state"),
      config.ssoLoginStateTtlSeconds,
      expect.any(String),
    );
  });
});
