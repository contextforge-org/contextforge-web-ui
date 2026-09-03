// Location: ./client/server/test/oauth-authorize.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// CONTEXTFORGE_URL must be set before src/config.ts (and anything importing it)
// is first evaluated, so the fake upstream server is spun up and
// process.env.CONTEXTFORGE_URL set in beforeAll, with every module under test
// dynamic-imported afterwards rather than statically at the top of the file.

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

let upstream: Server;
let upstreamOrigin: string;
let lastRequest:
  { path: string; authorization: string | undefined; accept: string | undefined } | undefined;

beforeAll(async () => {
  upstream = createServer((req: IncomingMessage, res) => {
    lastRequest = {
      path: req.url ?? "",
      authorization: req.headers.authorization,
      accept: req.headers.accept,
    };

    if (req.url?.startsWith("/oauth/authorize/missing-config")) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ detail: "Gateway is not configured for OAuth" }));
      return;
    }

    // Mirrors mcpgateway's initiate_oauth_flow: redirect to the IdP's own
    // absolute authorization URL.
    res.writeHead(302, { location: "https://idp.example.com/authorize?client_id=abc" });
    res.end();
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
  const { port } = upstream.address() as AddressInfo;
  upstreamOrigin = `http://127.0.0.1:${port}`;
  process.env.CONTEXTFORGE_URL = upstreamOrigin;
});

afterAll(() => new Promise<void>((resolve) => upstream.close(() => resolve())));

async function buildApp() {
  const { buildTestApp } = await import("./helpers/build-app.js");
  return buildTestApp({ withProxy: true });
}

async function seedSession(app: Awaited<ReturnType<typeof buildApp>>) {
  const { createSession } = await import("../src/lib/session-store.js");
  const sessionId = await createSession(app.redis as never, {
    bearerToken: "test-bearer-token", // pragma: allowlist secret
    user: { email: "user@example.com", isAdmin: false },
  });
  return { cookie: `bff_sid=${sessionId}` };
}

describe("GET /oauth/authorize/:gatewayId", () => {
  it("401s without a session cookie", async () => {
    const app = await buildApp();
    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/authorize/gw-1?popup=true",
    });
    expect(response.statusCode).toBe(401);
  });

  it("injects the bearer token and forwards the provider redirect untouched", async () => {
    const app = await buildApp();
    const { cookie } = await seedSession(app);

    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/authorize/gw-1?popup=true",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(302);
    // Must reach the OAuth provider directly -- rewriting this the way
    // catch-all.ts rewrites upstream /api/* redirects would send the popup
    // back into the BFF instead of out to the IdP.
    expect(response.headers.location).toBe("https://idp.example.com/authorize?client_id=abc");
    expect(lastRequest?.path).toBe("/oauth/authorize/gw-1?popup=true");
    expect(lastRequest?.authorization).toBe("Bearer test-bearer-token");
  });

  it("never lets the browser override the injected Authorization header", async () => {
    const app = await buildApp();
    const { cookie } = await seedSession(app);

    await app.fastify.inject({
      method: "GET",
      url: "/oauth/authorize/gw-1",
      headers: { cookie, authorization: "Bearer attacker-supplied-token" }, // pragma: allowlist secret
    });

    expect(lastRequest?.authorization).toBe("Bearer test-bearer-token");
  });

  it("rejects a cross-site request before calling upstream", async () => {
    const app = await buildApp();
    const { cookie } = await seedSession(app);
    lastRequest = undefined;

    // Same shape as password-reset.test.ts's cross-origin case: a mismatched
    // Origin header is what a hostile page forcing
    // window.open(`${victimOrigin}/oauth/authorize/<id>`) would send. This
    // route runs DCR registration and DB writes with the victim's injected
    // bearer token, and can't rely on a CSRF token (window.open sets no
    // headers), so it needs the same isForbiddenCrossOrigin guard as
    // login.ts/proxy-sse.ts.
    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/authorize/gw-1?popup=true",
      headers: { cookie, host: "app.example.test", origin: "https://evil.example.test" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "cross_site_request_forbidden" });
    // Rejected before ever reaching upstream.
    expect(lastRequest).toBeUndefined();
  });

  it("forwards a non-redirect upstream error response", async () => {
    const app = await buildApp();
    const { cookie } = await seedSession(app);

    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/authorize/missing-config",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ detail: "Gateway is not configured for OAuth" });
  });
});
