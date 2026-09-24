// Location: ./client/server/test/sso-callback.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// config.ts reads SSO_* env vars once at import time, so each case resets
// the module registry and re-imports build-app.js fresh -- same pattern as
// sso-login.test.ts.

import { generateKeyPairSync, sign as signBuffer, type KeyObject } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SSO_LOGIN_BINDING_COOKIE } from "../src/lib/sso-login-state.js";
import type { TestApp } from "./helpers/build-app.js";

const ENV_KEYS = [
  "SSO_ENABLED",
  "SSO_KEYCLOAK_BASE_URL",
  "SSO_KEYCLOAK_PUBLIC_BASE_URL",
  "SSO_KEYCLOAK_REALM",
  "SSO_KEYCLOAK_CLIENT_ID",
  "SSO_KEYCLOAK_CLIENT_SECRET",
] as const;

const ISSUER = "http://keycloak-internal:8080/realms/mcp-gateway";
const TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`;
const JWKS_ENDPOINT = `${ISSUER}/protocol/openid-connect/certs`;
const CLIENT_ID = "contextforge-web-ui"; // matches enableSso()'s SSO_KEYCLOAK_CLIENT_ID
const KID = "test-kid";

let keyPair: { publicKey: KeyObject; privateKey: KeyObject };

beforeAll(() => {
  keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
});

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

function publicJwk(): Record<string, unknown> {
  return { ...keyPair.publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "RS256" };
}

// iss/aud/exp default to values verifySsoIdToken accepts, so call sites only
// need to override the claims their test actually cares about (email, nonce, ...).
function makeIdToken(claimOverrides: Record<string, unknown>): string {
  const claims = {
    iss: ISSUER,
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claimOverrides,
  };
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = signBuffer(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    keyPair.privateKey,
  );
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

function mockDiscoveryFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
        token_endpoint: TOKEN_ENDPOINT,
        jwks_uri: JWKS_ENDPOINT,
      }),
    })),
  );
}

// Discovery is cached after the login call, so this only needs to serve the
// token and JWKS endpoints for the callback -- anything else is a test-setup bug.
function mockTokenExchange(idTokenClaims: Record<string, unknown>, ok = true, status = 400): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const href = String(url);
      if (href === JWKS_ENDPOINT) {
        return { ok: true, status: 200, json: async () => ({ keys: [publicJwk()] }) };
      }
      if (href !== TOKEN_ENDPOINT) {
        throw new Error(`unexpected fetch during callback test: ${url}`);
      }
      if (!ok) {
        return { ok: false, status, json: async () => ({ error: "invalid_grant" }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "keycloak-access-token", // pragma: allowlist secret
          refresh_token: "keycloak-refresh-token", // pragma: allowlist secret
          id_token: makeIdToken(idTokenClaims), // pragma: allowlist secret
          expires_in: 300,
        }),
      };
    }),
  );
}

async function freshBuildTestApp(): Promise<typeof import("./helpers/build-app.js").buildTestApp> {
  vi.resetModules();
  const { buildTestApp } = await import("./helpers/build-app.js");
  return buildTestApp;
}

async function performLogin(
  app: TestApp,
  next?: string,
): Promise<{ state: string; nonce: string; binding: string }> {
  const url = next ? `/auth/sso/login?next=${encodeURIComponent(next)}` : "/auth/sso/login";
  const response = await app.fastify.inject({ method: "GET", url });
  const location = new URL(response.headers.location as string);
  const binding = response.cookies.find((c) => c.name === SSO_LOGIN_BINDING_COOKIE)!.value;
  return {
    state: location.searchParams.get("state")!,
    nonce: location.searchParams.get("nonce")!,
    binding,
  };
}

function callbackUrl(params: Record<string, string>): string {
  return `/auth/sso/callback?${new URLSearchParams(params).toString()}`;
}

describe("GET /auth/sso/callback", () => {
  it("exchanges the code, establishes a session, and redirects to the stored next path", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state, nonce, binding } = await performLogin(app, "/app/tools");

    mockTokenExchange({
      email: "user@example.com",
      email_verified: true,
      name: "Test User",
      nonce,
    });
    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=${binding}` },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/app/tools");
    const sessionCookie = response.cookies.find((c) => c.name === "bff_sid");
    expect(sessionCookie?.value).toBeTruthy();

    const sessionResponse = await app.fastify.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: `bff_sid=${sessionCookie!.value}` },
    });
    expect(sessionResponse.json()).toMatchObject({
      authenticated: true,
      user: { email: "user@example.com", auth_provider: "sso" },
    });
  });

  it("clears the binding cookie on success", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state, nonce, binding } = await performLogin(app);

    mockTokenExchange({ email: "user@example.com", email_verified: true, nonce });
    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=${binding}` },
    });

    const cleared = response.cookies.find((c) => c.name === SSO_LOGIN_BINDING_COOKIE);
    expect(cleared?.value).toBe("");
  });

  it("consumes the state exactly once -- replaying the same callback fails", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state, nonce, binding } = await performLogin(app);

    mockTokenExchange({ email: "user@example.com", email_verified: true, nonce });
    const headers = { cookie: `${SSO_LOGIN_BINDING_COOKIE}=${binding}` };
    const first = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers,
    });
    const second = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers,
    });

    expect(first.headers.location).not.toContain("error=");
    expect(second.headers.location).toBe("/app/login?error=sso_state_invalid");
    expect(second.cookies.find((c) => c.name === "bff_sid")?.value ?? "").toBe("");
  });

  it("redirects with a recognizable error on Keycloak's own access_denied, without establishing a session", async () => {
    enableSso();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ error: "access_denied" }),
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/app/login?error=sso_access_denied");
    expect(response.cookies.find((c) => c.name === "bff_sid")).toBeUndefined();
  });

  it("redirects with an error when code or state is missing", async () => {
    enableSso();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code" }),
    });

    expect(response.headers.location).toBe("/app/login?error=sso_callback_invalid");
  });

  it("redirects with an error for an unknown or already-expired state", async () => {
    enableSso();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state: "unknown-state" }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=some-binding` },
    });

    expect(response.headers.location).toBe("/app/login?error=sso_state_invalid");
  });

  it("redirects with an error when the binding cookie is missing", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state } = await performLogin(app);

    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
    });

    expect(response.headers.location).toBe("/app/login?error=sso_state_invalid");
  });

  it("redirects with an error when the binding cookie doesn't match", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state } = await performLogin(app);

    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=wrong-binding` },
    });

    expect(response.headers.location).toBe("/app/login?error=sso_state_invalid");
  });

  it("redirects with an error when the token exchange fails", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state, binding } = await performLogin(app);

    mockTokenExchange({}, false);
    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=${binding}` },
    });

    expect(response.headers.location).toBe("/app/login?error=sso_token_exchange_failed");
  });

  it("redirects with an error when the token response has no id_token", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state, binding } = await performLogin(app);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "at" }), // pragma: allowlist secret
      })),
    );
    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=${binding}` },
    });

    expect(response.headers.location).toBe("/app/login?error=sso_id_token_missing");
  });

  it("redirects with an error when the ID token nonce doesn't match the login attempt", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state, binding } = await performLogin(app);

    mockTokenExchange({ email: "user@example.com", nonce: "wrong-nonce" });
    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=${binding}` },
    });

    expect(response.headers.location).toBe("/app/login?error=sso_nonce_mismatch");
  });

  it("redirects with an error when the ID token has no email claim", async () => {
    enableSso();
    mockDiscoveryFetch();
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();
    const { state, nonce, binding } = await performLogin(app);

    mockTokenExchange({ nonce });
    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state }),
      headers: { cookie: `${SSO_LOGIN_BINDING_COOKIE}=${binding}` },
    });

    expect(response.headers.location).toBe("/app/login?error=sso_email_missing");
  });

  it("redirects with an error when SSO is disabled", async () => {
    delete process.env.SSO_ENABLED;
    const buildTestApp = await freshBuildTestApp();
    const app = await buildTestApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: callbackUrl({ code: "auth-code", state: "any" }),
    });

    expect(response.headers.location).toBe("/app/login?error=sso_disabled");
  });
});
