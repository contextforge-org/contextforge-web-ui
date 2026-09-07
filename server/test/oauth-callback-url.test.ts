// Location: ./client/server/test/oauth-callback-url.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// config.ts reads process.env.PUBLIC_ORIGIN once at import time (see
// config.ts's own module-load comment), so exercising both the "unset" and
// "set" derivations in one file needs vi.resetModules() + a fresh dynamic
// import between them -- a plain re-import would just return the
// already-evaluated, cached config.

import { afterEach, describe, expect, it, vi } from "vitest";

const originalPublicOrigin = process.env.PUBLIC_ORIGIN;

afterEach(() => {
  if (originalPublicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = originalPublicOrigin;
});

async function buildAppWithPublicOrigin(publicOrigin: string | undefined) {
  vi.resetModules();
  if (publicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = publicOrigin;

  const { buildTestApp } = await import("./helpers/build-app.js");
  return buildTestApp({ withProxy: true });
}

async function seedSession(app: Awaited<ReturnType<typeof buildAppWithPublicOrigin>>) {
  const { createSession } = await import("../src/lib/session-store.js");
  const sessionId = await createSession(app.redis as never, {
    bearerToken: "test-bearer-token", // pragma: allowlist secret
    user: { email: "user@example.com", isAdmin: false },
  });
  return { cookie: `bff_sid=${sessionId}` };
}

describe("GET /oauth/callback-url", () => {
  it("401s without a session cookie", async () => {
    const app = await buildAppWithPublicOrigin(undefined);

    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/callback-url",
    });

    expect(response.statusCode).toBe(401);
  });

  it("derives the callback URL from the request's own scheme/host when PUBLIC_ORIGIN is unset", async () => {
    const app = await buildAppWithPublicOrigin(undefined);
    const { cookie } = await seedSession(app);

    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/callback-url",
      headers: { cookie, host: "app.example.test" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ redirectUri: "http://app.example.test/oauth/callback" });
  });

  it("prefers PUBLIC_ORIGIN over the request's own host -- the split-deployment case", async () => {
    const app = await buildAppWithPublicOrigin("https://web.example.com");
    const { cookie } = await seedSession(app);

    // Even though this request arrived with a different Host (e.g. an
    // internal LB hostname), PUBLIC_ORIGIN is the operator-declared source of
    // truth for where the browser actually reaches this deployment -- and
    // this is the same value the gateway's own APP_DOMAIN default would NOT
    // resolve to in a split deployment, which is the whole point.
    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/callback-url",
      headers: { cookie, host: "internal-lb.local:8080" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ redirectUri: "https://web.example.com/oauth/callback" });
  });
});
