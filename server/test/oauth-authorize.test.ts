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

    if (req.url?.startsWith("/oauth/authorize/network-error")) {
      // No response at all -- destroying the socket is what makes fetch()
      // reject inside forwardOAuthGet's catch, the actual trigger for its
      // 502, as opposed to a well-formed non-2xx upstream response.
      req.socket.destroy();
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
  return { cookie: `bff_sid=${sessionId}`, sessionId };
}

// Bypasses the HTTP-level POST /oauth/authorize-nonce route (covered in its
// own test file) the same way seedSession bypasses POST /auth/login --
// exercises the authorize route's *consumption* of a nonce, not the minting
// route.
async function mintNonce(app: Awaited<ReturnType<typeof buildApp>>, sessionId: string) {
  const { mintOAuthAuthorizeNonce } = await import("../src/lib/oauth-authorize-nonce.js");
  return mintOAuthAuthorizeNonce(app.redis as never, sessionId);
}

describe("GET /oauth/authorize/:gatewayId", () => {
  it("401s without a session cookie, posting an oauth_callback error the opener can read", async () => {
    const app = await buildApp();
    const response = await app.fastify.inject({
      method: "GET",
      url: "/oauth/authorize/gw-1?popup=true",
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("window.opener");
    expect(response.body).toContain('"type":"oauth_callback"');
    expect(response.body).toContain('"status":"error"');
    expect(response.body).toContain("window.close()");
  });

  it("injects the bearer token and forwards the provider redirect untouched", async () => {
    const app = await buildApp();
    const { cookie, sessionId } = await seedSession(app);
    const nonce = await mintNonce(app, sessionId);

    const response = await app.fastify.inject({
      method: "GET",
      url: `/oauth/authorize/gw-1?popup=true&nonce=${nonce}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(302);
    // Must reach the OAuth provider directly -- rewriting this the way
    // catch-all.ts rewrites upstream /api/* redirects would send the popup
    // back into the BFF instead of out to the IdP.
    expect(response.headers.location).toBe("https://idp.example.com/authorize?client_id=abc");
    // nonce is BFF-internal and consumed before forwarding -- mcpgateway
    // never sees it.
    expect(lastRequest?.path).toBe("/oauth/authorize/gw-1?popup=true");
    expect(lastRequest?.authorization).toBe("Bearer test-bearer-token");
  });

  it("never lets the browser override the injected Authorization header", async () => {
    const app = await buildApp();
    const { cookie, sessionId } = await seedSession(app);
    const nonce = await mintNonce(app, sessionId);

    await app.fastify.inject({
      method: "GET",
      url: `/oauth/authorize/gw-1?nonce=${nonce}`,
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
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain('"error":"cross_site_request_forbidden"');
    expect(response.body).toContain("window.close()");
    // Rejected before ever reaching upstream.
    expect(lastRequest).toBeUndefined();
  });

  it("forwards a non-redirect upstream error response as-is, not the popup HTML shape", async () => {
    const app = await buildApp();
    const { cookie, sessionId } = await seedSession(app);
    const nonce = await mintNonce(app, sessionId);

    const response = await app.fastify.inject({
      method: "GET",
      url: `/oauth/authorize/missing-config?nonce=${nonce}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ detail: "Gateway is not configured for OAuth" });
  });

  it("posts an oauth_callback error instead of raw JSON when the upstream connection fails", async () => {
    const app = await buildApp();
    const { cookie, sessionId } = await seedSession(app);
    const nonce = await mintNonce(app, sessionId);

    const response = await app.fastify.inject({
      method: "GET",
      url: `/oauth/authorize/network-error?nonce=${nonce}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(502);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain('"error":"upstream_unavailable"');
    expect(response.body).toContain("window.close()");
  });

  describe("nonce requirement", () => {
    it("rejects a missing nonce before calling upstream", async () => {
      const app = await buildApp();
      const { cookie } = await seedSession(app);
      lastRequest = undefined;

      const response = await app.fastify.inject({
        method: "GET",
        url: "/oauth/authorize/gw-1?popup=true",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).toContain('"error":"cross_site_request_forbidden"');
      expect(lastRequest).toBeUndefined();
    });

    it("rejects a nonce that was never minted", async () => {
      const app = await buildApp();
      const { cookie } = await seedSession(app);
      lastRequest = undefined;

      const response = await app.fastify.inject({
        method: "GET",
        url: "/oauth/authorize/gw-1?popup=true&nonce=00000000-0000-0000-0000-000000000000",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      expect(lastRequest).toBeUndefined();
    });

    it("rejects a nonce reused for a second request", async () => {
      const app = await buildApp();
      const { cookie, sessionId } = await seedSession(app);
      const nonce = await mintNonce(app, sessionId);

      const first = await app.fastify.inject({
        method: "GET",
        url: `/oauth/authorize/gw-1?popup=true&nonce=${nonce}`,
        headers: { cookie },
      });
      expect(first.statusCode).toBe(302);

      lastRequest = undefined;
      const replay = await app.fastify.inject({
        method: "GET",
        url: `/oauth/authorize/gw-1?popup=true&nonce=${nonce}`,
        headers: { cookie },
      });

      expect(replay.statusCode).toBe(403);
      expect(lastRequest).toBeUndefined();
    });

    // Regression: consumeOAuthAuthorizeNonce used to be a plain
    // GET-then-DEL, leaving a window between the two awaits where a second
    // concurrent request for the same nonce could still read its session
    // binding before either request's DEL ran, letting both proceed. Fired
    // together (not awaited sequentially, unlike the reuse test above) to
    // actually exercise that interleaving.
    it("lets exactly one of two concurrent requests for the same nonce through", async () => {
      const app = await buildApp();
      const { cookie, sessionId } = await seedSession(app);
      const nonce = await mintNonce(app, sessionId);

      const [first, second] = await Promise.all([
        app.fastify.inject({
          method: "GET",
          url: `/oauth/authorize/gw-1?popup=true&nonce=${nonce}`,
          headers: { cookie },
        }),
        app.fastify.inject({
          method: "GET",
          url: `/oauth/authorize/gw-1?popup=true&nonce=${nonce}`,
          headers: { cookie },
        }),
      ]);

      const statusCodes = [first.statusCode, second.statusCode].sort();
      expect(statusCodes).toEqual([302, 403]);
    });

    it("rejects a nonce minted for a different session", async () => {
      const app = await buildApp();
      const { cookie } = await seedSession(app);
      const { sessionId: otherSessionId } = await seedSession(app);
      const nonceForOtherSession = await mintNonce(app, otherSessionId);
      lastRequest = undefined;

      const response = await app.fastify.inject({
        method: "GET",
        url: `/oauth/authorize/gw-1?popup=true&nonce=${nonceForOtherSession}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      expect(lastRequest).toBeUndefined();
    });

    // Regression for the gap isForbiddenCrossOrigin leaves on its own: a
    // top-level GET navigation from a hostile *sibling* subdomain sends no
    // Origin header and a Sec-Fetch-Site of "same-site" (not "cross-site"),
    // so the origin guard alone would let it through carrying the victim's
    // SameSite=Lax session cookie. The nonce requirement is what actually
    // stops it, since the sibling has no way to have minted one.
    it("rejects a same-site request with no Origin header and no nonce", async () => {
      const app = await buildApp();
      const { cookie } = await seedSession(app);
      lastRequest = undefined;

      const response = await app.fastify.inject({
        method: "GET",
        url: "/oauth/authorize/gw-1?popup=true",
        headers: { cookie, host: "app.example.test", "sec-fetch-site": "same-site" },
      });

      expect(response.statusCode).toBe(403);
      expect(lastRequest).toBeUndefined();
    });
  });
});
