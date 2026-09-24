// Location: ./client/server/test/lib/sso-token-exchange.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "SSO_ENABLED",
  "SSO_KEYCLOAK_BASE_URL",
  "SSO_KEYCLOAK_REALM",
  "SSO_KEYCLOAK_CLIENT_ID",
  "SSO_KEYCLOAK_CLIENT_SECRET",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.SSO_ENABLED = "true";
  process.env.SSO_KEYCLOAK_BASE_URL = "http://keycloak-internal:8080";
  process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
  process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
  process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

async function freshImport(): Promise<typeof import("../../src/lib/sso-token-exchange.js")> {
  vi.resetModules();
  return import("../../src/lib/sso-token-exchange.js");
}

const PARAMS = {
  tokenEndpoint: "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/token",
  code: "auth-code",
  redirectUri: "https://app.example.com/auth/sso/callback",
  codeVerifier: "verifier",
};

function mockTokenFetch(
  body: unknown,
  ok = true,
  status = ok ? 200 : 400,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({ ok, status, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("exchangeSsoCode", () => {
  it("posts the authorization_code grant with client credentials and PKCE verifier", async () => {
    const fetchMock = mockTokenFetch({ access_token: "at" }); // pragma: allowlist secret
    const { exchangeSsoCode } = await freshImport();

    await exchangeSsoCode(PARAMS);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(PARAMS.tokenEndpoint);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe(PARAMS.code);
    expect(body.get("redirect_uri")).toBe(PARAMS.redirectUri);
    expect(body.get("client_id")).toBe("contextforge-web-ui");
    expect(body.get("client_secret")).toBe("dev-secret");
    expect(body.get("code_verifier")).toBe(PARAMS.codeVerifier);
  });

  it("maps the token response to camelCase", async () => {
    mockTokenFetch({
      access_token: "at", // pragma: allowlist secret
      refresh_token: "rt", // pragma: allowlist secret
      id_token: "idt", // pragma: allowlist secret
      expires_in: 300,
    });
    const { exchangeSsoCode } = await freshImport();

    const result = await exchangeSsoCode(PARAMS);

    expect(result).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      idToken: "idt",
      expiresIn: 300,
    });
  });

  it("throws SsoTokenExchangeError when the fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );
    const { exchangeSsoCode, SsoTokenExchangeError } = await freshImport();

    await expect(exchangeSsoCode(PARAMS)).rejects.toBeInstanceOf(SsoTokenExchangeError);
  });

  it("throws SsoTokenExchangeError on a non-2xx response", async () => {
    mockTokenFetch({ error: "invalid_grant" }, false, 400);
    const { exchangeSsoCode, SsoTokenExchangeError } = await freshImport();

    await expect(exchangeSsoCode(PARAMS)).rejects.toBeInstanceOf(SsoTokenExchangeError);
  });

  it("throws SsoTokenExchangeError on a non-JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      })),
    );
    const { exchangeSsoCode, SsoTokenExchangeError } = await freshImport();

    await expect(exchangeSsoCode(PARAMS)).rejects.toBeInstanceOf(SsoTokenExchangeError);
  });

  it("throws SsoTokenExchangeError when access_token is missing", async () => {
    mockTokenFetch({ token_type: "bearer" });
    const { exchangeSsoCode, SsoTokenExchangeError } = await freshImport();

    await expect(exchangeSsoCode(PARAMS)).rejects.toBeInstanceOf(SsoTokenExchangeError);
  });

  it("never leaks the token endpoint URL in the error message", async () => {
    mockTokenFetch({}, false, 500);
    const { exchangeSsoCode } = await freshImport();

    await expect(exchangeSsoCode(PARAMS)).rejects.not.toThrow(
      expect.stringContaining(PARAMS.tokenEndpoint),
    );
  });
});
