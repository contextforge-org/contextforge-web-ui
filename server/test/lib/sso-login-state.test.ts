// Location: ./client/server/test/lib/sso-login-state.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { config } from "../../src/config.js";
import { consumeSsoLoginState, mintSsoLoginState } from "../../src/lib/sso-login-state.js";
import { FakeRedis } from "../helpers/build-app.js";

const REDIRECT_URI = "https://app.example.com/auth/sso/callback";

describe("mintSsoLoginState / consumeSsoLoginState", () => {
  it("mints a state/nonce/codeChallenge/binding derived from a fresh PKCE verifier", async () => {
    const redis = new FakeRedis();

    const minted = await mintSsoLoginState(redis as never, "/app/tools", REDIRECT_URI);

    expect(minted.state).toBeTruthy();
    expect(minted.nonce).toBeTruthy();
    expect(minted.binding).toBeTruthy();
    expect(minted.state).not.toBe(minted.nonce);

    const record = await consumeSsoLoginState(redis as never, minted.state, minted.binding);
    expect(record).not.toBeNull();
    const expectedChallenge = createHash("sha256").update(record!.codeVerifier).digest("base64url");
    expect(minted.codeChallenge).toBe(expectedChallenge);
    expect(record!.nonce).toBe(minted.nonce);
    expect(record!.returnTo).toBe("/app/tools");
    expect(record!.redirectUri).toBe(REDIRECT_URI);
  });

  it("consumes the state exactly once -- a second consume returns null", async () => {
    const redis = new FakeRedis();
    const { state, binding } = await mintSsoLoginState(redis as never, "/app/", REDIRECT_URI);

    expect(await consumeSsoLoginState(redis as never, state, binding)).not.toBeNull();
    expect(await consumeSsoLoginState(redis as never, state, binding)).toBeNull();
  });

  it("returns null for an undefined or unknown state", async () => {
    const redis = new FakeRedis();

    expect(await consumeSsoLoginState(redis as never, undefined, "some-binding")).toBeNull();
    expect(await consumeSsoLoginState(redis as never, "unknown-state", "some-binding")).toBeNull();
  });

  it("returns null when the binding cookie is missing", async () => {
    const redis = new FakeRedis();
    const { state } = await mintSsoLoginState(redis as never, "/app/", REDIRECT_URI);

    expect(await consumeSsoLoginState(redis as never, state, undefined)).toBeNull();
  });

  it("returns null on a binding mismatch, and burns the state like any other single use", async () => {
    const redis = new FakeRedis();
    const { state, binding } = await mintSsoLoginState(redis as never, "/app/", REDIRECT_URI);

    expect(await consumeSsoLoginState(redis as never, state, "wrong-binding")).toBeNull();
    expect(await consumeSsoLoginState(redis as never, state, binding)).toBeNull();
  });

  it("stores the record with the configured TTL", async () => {
    const redis = new FakeRedis();
    const setexSpy = vi.spyOn(redis, "setex");

    await mintSsoLoginState(redis as never, "/app/", REDIRECT_URI);

    expect(setexSpy).toHaveBeenCalledWith(
      expect.stringContaining("sso-login-state"),
      config.ssoLoginStateTtlSeconds,
      expect.any(String),
    );
  });

  it("never stores the raw binding value, only its hash", async () => {
    const redis = new FakeRedis();
    const setexSpy = vi.spyOn(redis, "setex");

    const { binding } = await mintSsoLoginState(redis as never, "/app/", REDIRECT_URI);

    const storedValue = setexSpy.mock.calls[0]?.[2] as string;
    expect(storedValue).not.toContain(binding);
  });
});
