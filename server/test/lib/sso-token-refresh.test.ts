// Location: ./client/server/test/lib/sso-token-refresh.test.ts
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

async function freshImport(): Promise<typeof import("../../src/lib/sso-token-refresh.js")> {
  vi.resetModules();
  return import("../../src/lib/sso-token-refresh.js");
}

const PARAMS = {
  tokenEndpoint: "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/token",
  refreshToken: "keycloak-refresh-token", // pragma: allowlist secret
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

describe("refreshSsoSession", () => {
  it("posts the refresh_token grant with client credentials", async () => {
    const fetchMock = mockTokenFetch({ access_token: "new-at" }); // pragma: allowlist secret
    const { refreshSsoSession } = await freshImport();

    await refreshSsoSession(PARAMS);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(PARAMS.tokenEndpoint);
    expect(init.redirect).toBe("error");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe(PARAMS.refreshToken);
    expect(body.get("client_id")).toBe("contextforge-web-ui");
    expect(body.get("client_secret")).toBe("dev-secret");
  });

  it("maps a successful refresh response to camelCase", async () => {
    mockTokenFetch({
      access_token: "new-at", // pragma: allowlist secret
      refresh_token: "new-rt", // pragma: allowlist secret
      id_token: "new-idt", // pragma: allowlist secret
      expires_in: 300,
    });
    const { refreshSsoSession } = await freshImport();

    const result = await refreshSsoSession(PARAMS);

    expect(result).toEqual({
      accessToken: "new-at",
      refreshToken: "new-rt",
      idToken: "new-idt",
      expiresIn: 300,
    });
  });

  it("does not require a rotated refresh_token/id_token in the response", async () => {
    mockTokenFetch({ access_token: "new-at", expires_in: 300 }); // pragma: allowlist secret
    const { refreshSsoSession } = await freshImport();

    const result = await refreshSsoSession(PARAMS);

    expect(result).toEqual({ accessToken: "new-at", expiresIn: 300 });
  });

  it("throws SsoTokenRefreshError when SSO is not configured", async () => {
    process.env.SSO_ENABLED = "false";
    const { refreshSsoSession, SsoTokenRefreshError } = await freshImport();

    await expect(refreshSsoSession(PARAMS)).rejects.toBeInstanceOf(SsoTokenRefreshError);
  });

  it("throws SsoTokenRefreshError when Keycloak is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );
    const { refreshSsoSession, SsoTokenRefreshError } = await freshImport();

    const err = await refreshSsoSession(PARAMS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SsoTokenRefreshError);
    expect((err as Error).message).not.toContain("invalid_grant");
  });

  it("throws SsoTokenRefreshError distinguishing a rejected (revoked/expired) refresh token", async () => {
    mockTokenFetch({ error: "invalid_grant" }, false, 400);
    const { refreshSsoSession, SsoTokenRefreshError } = await freshImport();

    const err = await refreshSsoSession(PARAMS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SsoTokenRefreshError);
    expect((err as Error).message).toContain("invalid_grant");
  });

  it("never leaks the token endpoint URL in the error message", async () => {
    mockTokenFetch({}, false, 500);
    const { refreshSsoSession, SsoTokenRefreshError } = await freshImport();

    const err = await refreshSsoSession(PARAMS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SsoTokenRefreshError);
    expect((err as Error).message).not.toContain(PARAMS.tokenEndpoint);
  });

  it("throws SsoTokenRefreshError on a non-JSON body", async () => {
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
    const { refreshSsoSession, SsoTokenRefreshError } = await freshImport();

    await expect(refreshSsoSession(PARAMS)).rejects.toBeInstanceOf(SsoTokenRefreshError);
  });

  it("throws SsoTokenRefreshError when the body is JSON null", async () => {
    mockTokenFetch(null);
    const { refreshSsoSession, SsoTokenRefreshError } = await freshImport();

    await expect(refreshSsoSession(PARAMS)).rejects.toBeInstanceOf(SsoTokenRefreshError);
  });

  it("throws SsoTokenRefreshError when access_token is missing", async () => {
    mockTokenFetch({ token_type: "bearer" });
    const { refreshSsoSession, SsoTokenRefreshError } = await freshImport();

    await expect(refreshSsoSession(PARAMS)).rejects.toBeInstanceOf(SsoTokenRefreshError);
  });
});
