// Location: ./client/server/test/config.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// config.ts validates itself at import time (throws on bad env), so each
// case here mutates process.env then re-imports the fresh module via
// vi.resetModules() rather than calling a validate() function directly.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_KEYS = [
  "NODE_ENV",
  "REDIS_URL",
  "COOKIE_SECURE",
  "PUBLIC_ORIGIN",
  "TRUST_PROXY",
  "PASSWORD_RESET_REQUEST_TIMEOUT_MS",
  "SSO_ENABLED",
  "SSO_KEYCLOAK_BASE_URL",
  "SSO_KEYCLOAK_PUBLIC_BASE_URL",
  "SSO_KEYCLOAK_REALM",
  "SSO_KEYCLOAK_CLIENT_ID",
  "SSO_KEYCLOAK_CLIENT_SECRET",
  "SSO_LOGIN_STATE_TTL_SECONDS",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

async function importConfig(): Promise<unknown> {
  const { config } = await import("../src/config.js");
  return config;
}

describe("config validation", () => {
  it("rejects REDIS_URL=memory:// in production", async () => {
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = "production";
    process.env.REDIS_URL = "memory://";
    process.env.TRUST_PROXY = "true"; // avoid tripping the unrelated origin-guard check

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow("REDIS_URL=memory:// is dev-only");
    resetModules();
  });

  it("rejects REDIS_URL=memory:// when COOKIE_SECURE defaults to true, even outside production", async () => {
    delete process.env.NODE_ENV;
    delete process.env.COOKIE_SECURE; // defaults to "true"
    process.env.REDIS_URL = "memory://";
    process.env.TRUST_PROXY = "true";

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow("REDIS_URL=memory:// is dev-only");
    resetModules();
  });

  it("allows REDIS_URL=memory:// for local dev (COOKIE_SECURE=false, no NODE_ENV)", async () => {
    delete process.env.NODE_ENV;
    process.env.COOKIE_SECURE = "false";
    process.env.REDIS_URL = "memory://";

    const { resetModules, run } = await freshImport();
    await expect(run()).resolves.toBeTruthy();
    resetModules();
  });

  it("rejects COOKIE_SECURE=true without PUBLIC_ORIGIN or TRUST_PROXY", async () => {
    process.env.COOKIE_SECURE = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    delete process.env.PUBLIC_ORIGIN;
    delete process.env.TRUST_PROXY;

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow(
      "COOKIE_SECURE=true requires either PUBLIC_ORIGIN or TRUST_PROXY=true",
    );
    resetModules();
  });

  it("allows COOKIE_SECURE=true with TRUST_PROXY=true set", async () => {
    process.env.COOKIE_SECURE = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.TRUST_PROXY = "true";
    delete process.env.PUBLIC_ORIGIN;

    const { resetModules, run } = await freshImport();
    await expect(run()).resolves.toBeTruthy();
    resetModules();
  });

  it("defaults the password-reset timeout above the upstream SMTP timeout", async () => {
    delete process.env.PASSWORD_RESET_REQUEST_TIMEOUT_MS;

    const { resetModules, run } = await freshImport();
    const loaded = (await run()) as { passwordResetRequestTimeoutMs: number };
    expect(loaded.passwordResetRequestTimeoutMs).toBe(30_000);
    resetModules();
  });

  it("rejects a non-positive password-reset timeout", async () => {
    process.env.PASSWORD_RESET_REQUEST_TIMEOUT_MS = "0";

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow(
      "PASSWORD_RESET_REQUEST_TIMEOUT_MS must be a positive integer",
    );
    resetModules();
  });

  it("boots with SSO_ENABLED unset (default false), no Keycloak vars required", async () => {
    delete process.env.SSO_ENABLED;
    delete process.env.SSO_KEYCLOAK_BASE_URL;
    delete process.env.SSO_KEYCLOAK_REALM;
    delete process.env.SSO_KEYCLOAK_CLIENT_ID;
    delete process.env.SSO_KEYCLOAK_CLIENT_SECRET;

    const { resetModules, run } = await freshImport();
    const loaded = (await run()) as { ssoEnabled: boolean };
    expect(loaded.ssoEnabled).toBe(false);
    resetModules();
  });

  it.each([
    ["SSO_KEYCLOAK_BASE_URL"],
    ["SSO_KEYCLOAK_REALM"],
    ["SSO_KEYCLOAK_CLIENT_ID"],
    ["SSO_KEYCLOAK_CLIENT_SECRET"],
  ])("rejects SSO_ENABLED=true with %s missing", async (missingKey) => {
    process.env.SSO_ENABLED = "true";
    process.env.SSO_KEYCLOAK_BASE_URL = "http://localhost:8180";
    process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
    process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
    process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret
    delete process.env[missingKey];

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow(`SSO_ENABLED=true requires ${missingKey}`);
    resetModules();
  });

  it("boots with SSO_ENABLED=true and all required Keycloak vars set", async () => {
    process.env.SSO_ENABLED = "true";
    process.env.SSO_KEYCLOAK_BASE_URL = "http://localhost:8180";
    process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
    process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
    process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret

    const { resetModules, run } = await freshImport();
    const loaded = (await run()) as { ssoEnabled: boolean; ssoKeycloakBaseUrl: string };
    expect(loaded.ssoEnabled).toBe(true);
    expect(loaded.ssoKeycloakBaseUrl).toBe("http://localhost:8180");
    resetModules();
  });

  it("rejects a malformed SSO_KEYCLOAK_BASE_URL", async () => {
    process.env.SSO_ENABLED = "true";
    process.env.SSO_KEYCLOAK_BASE_URL = "not-a-url";
    process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
    process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
    process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow('SSO_KEYCLOAK_BASE_URL "not-a-url" is not a valid URL');
    resetModules();
  });

  it("rejects a malformed SSO_KEYCLOAK_PUBLIC_BASE_URL", async () => {
    process.env.SSO_ENABLED = "true";
    process.env.SSO_KEYCLOAK_BASE_URL = "http://localhost:8180";
    process.env.SSO_KEYCLOAK_PUBLIC_BASE_URL = "not-a-url";
    process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
    process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
    process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow(
      'SSO_KEYCLOAK_PUBLIC_BASE_URL "not-a-url" is not a valid URL',
    );
    resetModules();
  });

  it("rejects a non-positive SSO login state TTL", async () => {
    process.env.SSO_LOGIN_STATE_TTL_SECONDS = "0";

    const { resetModules, run } = await freshImport();
    await expect(run()).rejects.toThrow("SSO_LOGIN_STATE_TTL_SECONDS must be a positive integer");
    resetModules();
  });
});

// vi.resetModules() alone doesn't help here because config.ts throws at
// *import* time — dynamic import() caches rejected promises too, so each
// case needs both a fresh module registry AND a fresh dynamic import call.
async function freshImport(): Promise<{ resetModules: () => void; run: () => Promise<unknown> }> {
  const { resetModules } = await import("vitest").then((v) => ({
    resetModules: v.vi.resetModules,
  }));
  resetModules();
  return { resetModules, run: importConfig };
}
