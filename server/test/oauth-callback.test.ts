// Location: ./client/server/test/oauth-callback.test.ts
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
let lastRequest: { path: string } | undefined;

beforeAll(async () => {
  upstream = createServer((req: IncomingMessage, res) => {
    lastRequest = { path: req.url ?? "" };

    // Mirrors mcpgateway's oauth_callback popup branch: an HTML page whose
    // inline script posts the result to window.opener and closes itself.
    res.writeHead(200, {
      "content-type": "text/html",
      // mcpgateway sets its own jwt_token cookie on the non-popup branch;
      // must never reach the browser through this proxy.
      "set-cookie": "jwt_token=upstream-secret; HttpOnly", // pragma: allowlist secret
    });
    res.end(
      "<!DOCTYPE html><html><body><script>window.opener&&window.opener.postMessage({status:'success'},'*');window.close();</script></body></html>",
    );
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

describe("GET /oauth/callback", () => {
  it("proxies with no session cookie required", async () => {
    const app = await buildApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/callback?code=abc123&state=popup.xyz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("window.opener");
    expect(lastRequest?.path).toBe("/oauth/callback?code=abc123&state=popup.xyz");
  });

  it("strips upstream Set-Cookie so mcpgateway's own cookie never reaches the browser", async () => {
    const app = await buildApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/callback?code=abc123&state=popup.xyz",
    });

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("forwards an OAuth provider error callback", async () => {
    const app = await buildApp();

    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/callback?error=access_denied&error_description=User+cancelled&state=popup.xyz",
    });

    expect(response.statusCode).toBe(200);
    expect(lastRequest?.path).toBe(
      "/oauth/callback?error=access_denied&error_description=User+cancelled&state=popup.xyz",
    );
  });
});
