// Location: ./client/server/test/lib/sso-user-resolution.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { generateKeyPairSync, sign as signBuffer, type KeyObject } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// resolveSsoUser is sync and has no config/network dependency -- import it
// once, outside the reset-modules dance verifySsoIdToken's tests need.
import { resolveSsoUser as resolveSsoUserSync } from "../../src/lib/sso-user-resolution.js";

const ENV_KEYS = [
  "SSO_ENABLED",
  "SSO_KEYCLOAK_BASE_URL",
  "SSO_KEYCLOAK_REALM",
  "SSO_KEYCLOAK_CLIENT_ID",
  "SSO_KEYCLOAK_CLIENT_SECRET",
] as const;

const BASE_URL = "http://keycloak-internal:8080";
const REALM = "mcp-gateway";
const CLIENT_ID = "contextforge-web-ui";
const ISSUER = `${BASE_URL}/realms/${REALM}`;
const DISCOVERY_URL = `${BASE_URL}/realms/${REALM}/.well-known/openid-configuration`;
const JWKS_URL = `${ISSUER}/protocol/openid-connect/certs`;
const KID = "test-kid";

let keyPair: { publicKey: KeyObject; privateKey: KeyObject };

beforeAll(() => {
  keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
});

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.SSO_ENABLED = "true";
  process.env.SSO_KEYCLOAK_BASE_URL = BASE_URL;
  process.env.SSO_KEYCLOAK_REALM = REALM;
  process.env.SSO_KEYCLOAK_CLIENT_ID = CLIENT_ID;
  process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

async function freshImport(): Promise<typeof import("../../src/lib/sso-user-resolution.js")> {
  vi.resetModules();
  return import("../../src/lib/sso-user-resolution.js");
}

function signToken(
  headerOverrides: Record<string, unknown>,
  claims: Record<string, unknown>,
  key: KeyObject = keyPair.privateKey,
): string {
  const header = { alg: "RS256", typ: "JWT", kid: KID, ...headerOverrides };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = signBuffer("RSA-SHA256", Buffer.from(`${headerB64}.${payloadB64}`), key);
  return `${headerB64}.${payloadB64}.${signature.toString("base64url")}`;
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    email: "user@example.com",
    email_verified: true,
    name: "Test User",
    nonce: "abc",
    ...overrides,
  };
}

function mockDiscoveryAndJwks(jwks: Record<string, unknown>[] = [publicJwk()]): void {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = url.toString();
    if (href === DISCOVERY_URL) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
          token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
          jwks_uri: JWKS_URL,
        }),
      };
    }
    if (href === JWKS_URL) {
      return { ok: true, status: 200, json: async () => ({ keys: jwks }) };
    }
    throw new Error(`unexpected fetch url in test: ${href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function publicJwk(kid: string = KID): Record<string, unknown> {
  return { ...keyPair.publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
}

describe("verifySsoIdToken", () => {
  it("verifies a validly signed token and returns its claims", async () => {
    mockDiscoveryAndJwks();
    const claims = validClaims();
    const token = signToken({}, claims);
    const { verifySsoIdToken } = await freshImport();

    await expect(verifySsoIdToken(token)).resolves.toEqual(claims);
  });

  it("throws SsoIdTokenError when SSO is not configured", async () => {
    process.env.SSO_ENABLED = "false";
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken("a.b.c")).rejects.toBeInstanceOf(SsoIdTokenError);
  });

  it("throws SsoIdTokenError when the token isn't a 3-part JWT", async () => {
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken("not-a-jwt")).rejects.toBeInstanceOf(SsoIdTokenError);
  });

  it("throws SsoIdTokenError when the header segment isn't valid JSON", async () => {
    const bogusHeader = Buffer.from("not json").toString("base64url");
    const payload = Buffer.from(JSON.stringify(validClaims())).toString("base64url");
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(`${bogusHeader}.${payload}.sig`)).rejects.toBeInstanceOf(
      SsoIdTokenError,
    );
  });

  it("throws SsoIdTokenError when the payload segment isn't valid JSON", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: KID })).toString("base64url");
    const bogusPayload = Buffer.from("not json").toString("base64url");
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(`${header}.${bogusPayload}.sig`)).rejects.toBeInstanceOf(
      SsoIdTokenError,
    );
  });

  it("throws SsoIdTokenError when the payload segment isn't valid base64url", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: KID })).toString("base64url");
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(`${header}.not!valid$base64url.sig`)).rejects.toBeInstanceOf(
      SsoIdTokenError,
    );
  });

  it("throws SsoIdTokenError when the algorithm is not RS256", async () => {
    const token = signToken({ alg: "none" }, validClaims());
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(token)).rejects.toBeInstanceOf(SsoIdTokenError);
  });

  it("throws SsoIdTokenError when the kid isn't in Keycloak's JWKS", async () => {
    mockDiscoveryAndJwks([publicJwk("other-kid")]);
    const token = signToken({}, validClaims());
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(token)).rejects.toBeInstanceOf(SsoIdTokenError);
  });

  it("throws SsoIdTokenError when the signature doesn't verify", async () => {
    mockDiscoveryAndJwks();
    const otherKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = signToken({}, validClaims(), otherKeyPair.privateKey);
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(token)).rejects.toBeInstanceOf(SsoIdTokenError);
  });

  it("throws SsoIdTokenError when iss doesn't match the discovered issuer", async () => {
    mockDiscoveryAndJwks();
    const token = signToken({}, validClaims({ iss: "http://attacker.example" }));
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(token)).rejects.toBeInstanceOf(SsoIdTokenError);
  });

  it("throws SsoIdTokenError when aud doesn't match this client", async () => {
    mockDiscoveryAndJwks();
    const token = signToken({}, validClaims({ aud: "some-other-client" }));
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(token)).rejects.toBeInstanceOf(SsoIdTokenError);
  });

  it("accepts aud as an array containing this client", async () => {
    mockDiscoveryAndJwks();
    const token = signToken({}, validClaims({ aud: ["some-other-client", CLIENT_ID] }));
    const { verifySsoIdToken } = await freshImport();

    await expect(verifySsoIdToken(token)).resolves.toMatchObject({ aud: expect.any(Array) });
  });

  it("throws SsoIdTokenError when the token is expired", async () => {
    mockDiscoveryAndJwks();
    const token = signToken({}, validClaims({ exp: Math.floor(Date.now() / 1000) - 1000 }));
    const { verifySsoIdToken, SsoIdTokenError } = await freshImport();

    await expect(verifySsoIdToken(token)).rejects.toBeInstanceOf(SsoIdTokenError);
  });
});

describe("resolveSsoUser", () => {
  it("builds a SessionUser from email/name claims", () => {
    const claims = {
      email: "user@example.com",
      email_verified: true,
      name: "Test User",
    };
    const user = resolveSsoUserSync(claims);

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

  it("falls back to preferred_username when name is absent", async () => {
    const user = resolveSsoUserSync({
      email: "user@example.com",
      email_verified: true,
      preferred_username: "tuser",
    });

    expect(user.full_name).toBe("tuser");
  });

  it("defaults full_name to null when neither claim is present", () => {
    const user = resolveSsoUserSync({ email: "user@example.com", email_verified: true });

    expect(user.full_name).toBeNull();
  });

  it("always sets is_admin false and password_change_required false", () => {
    const user = resolveSsoUserSync({ email: "user@example.com", email_verified: true });

    expect(user.is_admin).toBe(false);
    expect(user.password_change_required).toBe(false);
  });

  it("throws SsoIdTokenError when the email claim is missing", () => {
    expect(() => resolveSsoUserSync({})).toThrow("no email claim");
  });

  it("throws SsoIdTokenError when the email claim is an empty string", () => {
    expect(() => resolveSsoUserSync({ email: "" })).toThrow("no email claim");
  });

  it("throws SsoIdTokenError when email_verified is absent", () => {
    expect(() => resolveSsoUserSync({ email: "user@example.com" })).toThrow("not verified");
  });

  it("throws SsoIdTokenError when email_verified is false", () => {
    expect(() => resolveSsoUserSync({ email: "user@example.com", email_verified: false })).toThrow(
      "not verified",
    );
  });
});
