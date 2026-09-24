// Location: ./client/server/test/sso-login.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// config.ts reads SSO_* env vars once at import time, so each case resets
// the module registry and re-imports build-app.js fresh -- same pattern as
// config.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REDIRECT_VALIDATION_VECTORS } from "../../src/router/redirect-validation.fixtures.js";
import { SSO_LOGIN_BINDING_COOKIE } from "../src/lib/sso-login-state.js";
import { safeReturnTo } from "../src/routes/auth/sso-login.js";

const ENV_KEYS = [
  "SSO_ENABLED",
  "SSO_KEYCLOAK_BASE_URL",
  "SSO_KEYCLOAK_PUBLIC_BASE_URL",
  "SSO_KEYCLOAK_REALM",
  "SSO_KEYCLOAK_CLIENT_ID",
  "SSO_KEYCLOAK_CLIENT_SECRET",
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
  vi.unstubAllGlobals();
});

function enableSso(): void {
  process.env.SSO_ENABLED = "true";
  process.env.SSO_KEYCLOAK_BASE_URL = "http://keycloak-internal:8080";
  process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
  process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
  process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret
}

function mockDiscoveryFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        issuer: "http://keycloak-internal:8080/realms/mcp-gateway",
        authorization_endpoint:
          "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/auth",
        token_endpoint:
          "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/token",
        jwks_uri: "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/certs",
      }),
    })),
  );
}

async function freshBuildTestApp(): Promise<typeof import("./helpers/build-app.js").buildTestApp> {
  vi.resetModules();
  const { buildTestApp } = await import("./helpers/build-app.js");
  return buildTestApp;
}

describe("GET /auth/sso/login", () => {
  it("redirects to the login page with a prefixed error when SSO is disabled", async () => {
    delete process.env.SSO_ENABLED;
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({ method: "GET", url: "/auth/sso/login" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/app/login?error=sso_disabled");
  });

  it("redirects to the login page with a prefixed error on a cross-site request", async () => {
    enableSso();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: "/auth/sso/login",
      headers: { "sec-fetch-site": "cross-site" },
    });

    expect(response.statusCode).toBe(302);
    // Must start with "sso_" -- Login.tsx's error-param filter drops anything else.
    expect(response.headers.location).toBe("/app/login?error=sso_cross_site_forbidden");
  });

  it("redirects to Keycloak's authorization endpoint with all required PKCE/OAuth params", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: "/auth/sso/login?next=/app/tools",
    });

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe(
      "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/auth",
    );
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("client_id")).toBe("contextforge-web-ui");
    expect(location.searchParams.get("redirect_uri")).toMatch(/\/auth\/sso\/callback$/);
    expect(location.searchParams.get("scope")).toBe("openid profile email");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("nonce")).toBeTruthy();
  });

  it("sets an httpOnly, lax binding cookie tying the state to this browser", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({ method: "GET", url: "/auth/sso/login" });

    const cookie = response.cookies.find((c) => c.name === SSO_LOGIN_BINDING_COOKIE);
    expect(cookie).toBeTruthy();
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
  });

  it("stores the exact redirect_uri sent to Keycloak in the login-state record", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({ method: "GET", url: "/auth/sso/login" });

    const location = new URL(response.headers.location as string);
    const state = location.searchParams.get("state")!;
    const binding = response.cookies.find((c) => c.name === SSO_LOGIN_BINDING_COOKIE)!.value;
    const { consumeSsoLoginState } = await import("../src/lib/sso-login-state.js");
    const record = await consumeSsoLoginState(app.redis as never, state, binding);

    expect(record?.redirectUri).toBe(location.searchParams.get("redirect_uri"));
  });

  it("falls back to the default return path for an invalid next param", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: `/auth/sso/login?next=${encodeURIComponent("https://evil.example.com")}`,
    });

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    const state = location.searchParams.get("state")!;
    const binding = response.cookies.find((c) => c.name === SSO_LOGIN_BINDING_COOKIE)!.value;
    const { consumeSsoLoginState } = await import("../src/lib/sso-login-state.js");
    const record = await consumeSsoLoginState(app.redis as never, state, binding);
    expect(record?.returnTo).toBe("/app/");
  });

  it("redirects to the login page with a prefixed error when discovery fails", async () => {
    enableSso();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({ method: "GET", url: "/auth/sso/login" });

    expect(response.statusCode).toBe(302);
    // Proves no internal-URL detail leaks in the redirect (OidcDiscoveryError.message embeds it).
    expect(response.headers.location).toBe("/app/login?error=sso_discovery_failed");
  });

  it("falls back to the default return path instead of crashing on a repeated next param", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: "/auth/sso/login?next=/app/a&next=/app/b",
    });

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    const state = location.searchParams.get("state")!;
    const binding = response.cookies.find((c) => c.name === SSO_LOGIN_BINDING_COOKIE)!.value;
    const { consumeSsoLoginState } = await import("../src/lib/sso-login-state.js");
    const record = await consumeSsoLoginState(app.redis as never, state, binding);
    expect(record?.returnTo).toBe("/app/");
  });

  describe("safeReturnTo", () => {
    it.each(REDIRECT_VALIDATION_VECTORS)(
      "resolves %j the same way src/router/index.tsx's validateDestination does",
      ({ next, expected }) => {
        expect(safeReturnTo(next)).toBe(expected);
      },
    );
  });
});
