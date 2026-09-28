// Location: ./client/server/test/lib/sso-login-error-redirect.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  loginErrorRedirect,
  SSO_DEFAULT_RETURN_TO,
  SSO_LOGIN_PATH,
} from "../../src/lib/sso-login-error-redirect.js";

describe("loginErrorRedirect", () => {
  it("prefixes the error code with sso_ and omits next when no returnTo is given", () => {
    expect(loginErrorRedirect("disabled")).toBe(`${SSO_LOGIN_PATH}?error=sso_disabled`);
  });

  it("omits next when returnTo is the default return path", () => {
    expect(loginErrorRedirect("disabled", SSO_DEFAULT_RETURN_TO)).toBe(
      `${SSO_LOGIN_PATH}?error=sso_disabled`,
    );
  });

  it("appends next when returnTo is a real destination", () => {
    expect(loginErrorRedirect("token_exchange_failed", "/app/tools")).toBe(
      `${SSO_LOGIN_PATH}?error=sso_token_exchange_failed&next=%2Fapp%2Ftools`,
    );
  });

  it("code is always the first argument -- this is the one shared implementation both routes call", () => {
    // Regression guard for the bug this module fixed: sso-login.ts and
    // sso-callback.ts each had their own copy with the arguments swapped.
    const result = loginErrorRedirect("state_invalid", "/app/tools");
    expect(result).toContain("error=sso_state_invalid");
    expect(result).not.toContain("error=%2Fapp%2Ftools");
  });
});
