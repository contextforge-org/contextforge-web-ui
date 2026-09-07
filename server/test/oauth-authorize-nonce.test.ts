// Location: ./client/server/test/oauth-authorize-nonce.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { buildTestApp, cookieHeaderFrom } from "./helpers/build-app.js";

async function seedSession() {
  const { createSession } = await import("../src/lib/session-store.js");
  const app = await buildTestApp({ withProxy: true });
  const sessionId = await createSession(app.redis as never, {
    bearerToken: "test-bearer-token", // pragma: allowlist secret
    user: { email: "user@example.com", isAdmin: false },
  });
  return { app, cookie: `bff_sid=${sessionId}`, sessionId };
}

describe("POST /oauth/authorize-nonce", () => {
  it("401s without a session cookie", async () => {
    const { app } = await seedSession();

    const response = await app.fastify.inject({
      method: "POST",
      url: "/oauth/authorize-nonce",
    });

    expect(response.statusCode).toBe(401);
  });

  it("403s without a CSRF token even with a valid session", async () => {
    const { app, cookie } = await seedSession();

    const response = await app.fastify.inject({
      method: "POST",
      url: "/oauth/authorize-nonce",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it("mints a nonce for a same-origin, CSRF-token-carrying request", async () => {
    const { app, cookie, sessionId } = await seedSession();

    // Establish the CSRF secret cookie the same way every other mutating
    // route's caller does: read /auth/session (or /auth/login) first. Doing
    // that here rather than hand-rolling a token keeps this test bound to
    // the real plugin contract instead of @fastify/csrf-protection internals.
    const { getSession } = await import("../src/lib/session-store.js");
    const record = await getSession(app.redis as never, sessionId);
    expect(record).not.toBeNull();

    const sessionResponse = await app.fastify.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie },
    });
    expect(sessionResponse.statusCode).toBe(200);
    const { csrfToken } = sessionResponse.json() as { csrfToken: string };
    const setCookie = sessionResponse.headers["set-cookie"];
    const setCookieHeaders = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    const fullCookie = `${cookie}; ${cookieHeaderFrom(setCookieHeaders)}`;

    // {} + Content-Type: application/json — exactly what src/api/client.ts's
    // requestWithMeta actually sends for a bodyless POST (it always sets
    // Content-Type: application/json; the caller passes {} rather than
    // omitting the body). Asserted explicitly, not left to inject()'s
    // defaults, because omitting it here would silently stop covering the
    // FST_ERR_CTP_EMPTY_JSON_BODY regression below.
    const response = await app.fastify.inject({
      method: "POST",
      url: "/oauth/authorize-nonce",
      headers: {
        cookie: fullCookie,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      payload: "{}",
    });

    expect(response.statusCode).toBe(200);
    const { nonce } = response.json() as { nonce: string };
    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(10);
  });

  // Regression: src/api/servers.ts's triggerOAuthAuthorization originally
  // called api.post("/oauth/authorize-nonce") with no body argument.
  // client.ts's requestWithMeta always sets Content-Type: application/json
  // on a POST regardless of whether there's a body, so that produced a
  // truly empty body under a json Content-Type -- which Fastify's default
  // JSON parser rejects with FST_ERR_CTP_EMPTY_JSON_BODY before this route's
  // preHandler (sessionAuth, csrfProtection) ever runs, a 400 with no useful
  // error shape for the caller. The fix was client-side (pass {} explicitly,
  // matching /auth/logout's existing call), not a server-side parser
  // override like catch-all.ts's -- this route has exactly one caller. This
  // test pins that empty-body-plus-json-Content-Type shape as the failure
  // mode traceable back to the correct fix.
  it("400s FST_ERR_CTP_EMPTY_JSON_BODY on a truly empty body under Content-Type: application/json", async () => {
    const { app, cookie, sessionId } = await seedSession();
    const { getSession } = await import("../src/lib/session-store.js");
    expect(await getSession(app.redis as never, sessionId)).not.toBeNull();

    const sessionResponse = await app.fastify.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie },
    });
    const { csrfToken } = sessionResponse.json() as { csrfToken: string };
    const setCookie = sessionResponse.headers["set-cookie"];
    const setCookieHeaders = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    const fullCookie = `${cookie}; ${cookieHeaderFrom(setCookieHeaders)}`;

    const response = await app.fastify.inject({
      method: "POST",
      url: "/oauth/authorize-nonce",
      headers: {
        cookie: fullCookie,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      // No payload at all -- the shape that used to reach the real server
      // before triggerOAuthAuthorization was fixed to send {}.
    });

    expect(response.statusCode).toBe(400);
  });

  it("is unreachable via a cross-site Sec-Fetch-Site with no CSRF token, closing the same gap as oauth-authorize.ts", async () => {
    const { app, cookie } = await seedSession();

    const response = await app.fastify.inject({
      method: "POST",
      url: "/oauth/authorize-nonce",
      headers: { cookie, "sec-fetch-site": "same-site" },
    });

    // No X-CSRF-Token header -> csrfProtection rejects regardless of
    // Sec-Fetch-Site, which is the whole point: a hostile sibling subdomain
    // has no way to have obtained the token in the first place.
    expect(response.statusCode).toBe(403);
  });
});
