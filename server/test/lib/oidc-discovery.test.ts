// Location: ./client/server/test/lib/oidc-discovery.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Discovery is cached at module scope, so each case resets the module
// registry and re-imports fresh -- same pattern as config.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  process.env.SSO_ENABLED = "true";
  process.env.SSO_KEYCLOAK_BASE_URL = "http://keycloak-internal:8080";
  process.env.SSO_KEYCLOAK_REALM = "mcp-gateway";
  process.env.SSO_KEYCLOAK_CLIENT_ID = "contextforge-web-ui";
  process.env.SSO_KEYCLOAK_CLIENT_SECRET = "dev-secret"; // pragma: allowlist secret
  delete process.env.SSO_KEYCLOAK_PUBLIC_BASE_URL;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

function mockDiscoveryFetch(
  body: unknown,
  ok = true,
  status = ok ? 200 : 404,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function discoveryBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    issuer: "http://keycloak-internal:8080/realms/mcp-gateway",
    authorization_endpoint:
      "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/auth",
    token_endpoint:
      "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/token",
    jwks_uri: "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/certs",
    end_session_endpoint:
      "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/logout",
    ...overrides,
  };
}

async function freshImport(): Promise<typeof import("../../src/lib/oidc-discovery.js")> {
  vi.resetModules();
  return import("../../src/lib/oidc-discovery.js");
}

describe("getDiscoveryDocument", () => {
  it("fetches the well-known discovery URL for the configured realm", async () => {
    const fetchMock = mockDiscoveryFetch(discoveryBody());
    const { getDiscoveryDocument } = await freshImport();

    await getDiscoveryDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://keycloak-internal:8080/realms/mcp-gateway/.well-known/openid-configuration",
      expect.anything(),
    );
  });

  it("caches the discovery document -- a second call does not refetch", async () => {
    const fetchMock = mockDiscoveryFetch(discoveryBody());
    const { getDiscoveryDocument } = await freshImport();

    const first = await getDiscoveryDocument();
    const second = await getDiscoveryDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("refetches once the cache TTL has elapsed", async () => {
    const fetchMock = mockDiscoveryFetch(discoveryBody());
    const { getDiscoveryDocument } = await freshImport();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    await getDiscoveryDocument();
    nowSpy.mockReturnValue(1_000_000 + 60 * 60 * 1000 + 1); // just past the 1h TTL
    await getDiscoveryDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it("leaves the authorization endpoint untouched when no public base URL is set", async () => {
    mockDiscoveryFetch(discoveryBody());
    const { getDiscoveryDocument } = await freshImport();

    const doc = await getDiscoveryDocument();

    expect(doc.authorizationEndpoint).toBe(
      "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/auth",
    );
  });

  it("rewrites only scheme+host+port of the authorization endpoint to the public base URL, keeping the path", async () => {
    process.env.SSO_KEYCLOAK_PUBLIC_BASE_URL = "https://keycloak.example.com:9443";
    mockDiscoveryFetch(discoveryBody());
    const { getDiscoveryDocument } = await freshImport();

    const doc = await getDiscoveryDocument();

    expect(doc.authorizationEndpoint).toBe(
      "https://keycloak.example.com:9443/realms/mcp-gateway/protocol/openid-connect/auth",
    );
    expect(doc.endSessionEndpoint).toBe(
      "https://keycloak.example.com:9443/realms/mcp-gateway/protocol/openid-connect/logout",
    );
    // Server-to-server endpoints stay on the internal host.
    expect(doc.tokenEndpoint).toBe(
      "http://keycloak-internal:8080/realms/mcp-gateway/protocol/openid-connect/token",
    );
  });

  it("throws OidcDiscoveryError, not a raw TypeError, for a malformed authorization_endpoint when a public base URL is set", async () => {
    process.env.SSO_KEYCLOAK_PUBLIC_BASE_URL = "https://keycloak.example.com";
    mockDiscoveryFetch(discoveryBody({ authorization_endpoint: "not a url" }));
    const { getDiscoveryDocument, OidcDiscoveryError } = await freshImport();

    await expect(getDiscoveryDocument()).rejects.toBeInstanceOf(OidcDiscoveryError);
  });

  it("de-dupes concurrent callers into a single in-flight fetch", async () => {
    const fetchMock = mockDiscoveryFetch(discoveryBody());
    const { getDiscoveryDocument } = await freshImport();

    const [first, second, third] = await Promise.all([
      getDiscoveryDocument(),
      getDiscoveryDocument(),
      getDiscoveryDocument(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("throws OidcDiscoveryError when SSO_ENABLED is false, even with stale Keycloak vars still set", async () => {
    process.env.SSO_ENABLED = "false";
    mockDiscoveryFetch(discoveryBody());
    const { getDiscoveryDocument, OidcDiscoveryError } = await freshImport();

    await expect(getDiscoveryDocument()).rejects.toBeInstanceOf(OidcDiscoveryError);
  });

  it("throws OidcDiscoveryError on an issuer mismatch", async () => {
    mockDiscoveryFetch(
      discoveryBody({ issuer: "http://attacker-controlled:8080/realms/mcp-gateway" }),
    );
    const { getDiscoveryDocument, OidcDiscoveryError } = await freshImport();

    await expect(getDiscoveryDocument()).rejects.toThrow(/issuer mismatch/);
    await expect(getDiscoveryDocument()).rejects.toBeInstanceOf(OidcDiscoveryError);
  });

  it("throws OidcDiscoveryError when the fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );
    const { getDiscoveryDocument, OidcDiscoveryError } = await freshImport();

    await expect(getDiscoveryDocument()).rejects.toBeInstanceOf(OidcDiscoveryError);
  });

  it("throws OidcDiscoveryError on a non-2xx response", async () => {
    mockDiscoveryFetch({}, false, 404);
    const { getDiscoveryDocument, OidcDiscoveryError } = await freshImport();

    await expect(getDiscoveryDocument()).rejects.toThrow(OidcDiscoveryError);
  });

  it("throws OidcDiscoveryError when a required field is missing", async () => {
    mockDiscoveryFetch(discoveryBody({ authorization_endpoint: undefined }));
    const { getDiscoveryDocument, OidcDiscoveryError } = await freshImport();

    await expect(getDiscoveryDocument()).rejects.toThrow(/missing "authorization_endpoint"/);
    await expect(getDiscoveryDocument()).rejects.toBeInstanceOf(OidcDiscoveryError);
  });

  it("tolerates a missing end_session_endpoint (not every provider advertises one)", async () => {
    mockDiscoveryFetch(discoveryBody({ end_session_endpoint: undefined }));
    const { getDiscoveryDocument } = await freshImport();

    const doc = await getDiscoveryDocument();

    expect(doc.endSessionEndpoint).toBeUndefined();
  });
});
