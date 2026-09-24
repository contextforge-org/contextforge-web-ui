// Location: ./client/server/test/lib/sso-user-resolution.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  decodeSsoIdToken,
  resolveSsoUser,
  SsoIdTokenError,
} from "../../src/lib/sso-user-resolution.js";

function makeIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("decodeSsoIdToken", () => {
  it("decodes the payload segment without verifying the signature", () => {
    const claims = decodeSsoIdToken(makeIdToken({ email: "user@example.com", nonce: "abc" }));

    expect(claims).toEqual({ email: "user@example.com", nonce: "abc" });
  });

  it("throws SsoIdTokenError when the token isn't a 3-part JWT", () => {
    expect(() => decodeSsoIdToken("not-a-jwt")).toThrow(SsoIdTokenError);
  });

  it("throws SsoIdTokenError when the payload segment isn't valid JSON", () => {
    const bogusPayload = Buffer.from("not json").toString("base64url");
    expect(() => decodeSsoIdToken(`header.${bogusPayload}.sig`)).toThrow(SsoIdTokenError);
  });
});

describe("resolveSsoUser", () => {
  it("builds a SessionUser from email/name claims", () => {
    const user = resolveSsoUser({
      email: "user@example.com",
      email_verified: true,
      name: "Test User",
    });

    expect(user).toEqual({
      email: "user@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "sso",
      email_verified: true,
      password_change_required: false,
    });
  });

  it("falls back to preferred_username when name is absent", () => {
    const user = resolveSsoUser({ email: "user@example.com", preferred_username: "tuser" });

    expect(user.full_name).toBe("tuser");
  });

  it("defaults full_name to null when neither claim is present", () => {
    const user = resolveSsoUser({ email: "user@example.com" });

    expect(user.full_name).toBeNull();
  });

  it("defaults email_verified to false when the claim is absent", () => {
    const user = resolveSsoUser({ email: "user@example.com" });

    expect(user.email_verified).toBe(false);
  });

  it("always sets is_admin false and password_change_required false", () => {
    const user = resolveSsoUser({ email: "user@example.com" });

    expect(user.is_admin).toBe(false);
    expect(user.password_change_required).toBe(false);
  });

  it("throws SsoIdTokenError when the email claim is missing", () => {
    expect(() => resolveSsoUser({})).toThrow(SsoIdTokenError);
  });
});
