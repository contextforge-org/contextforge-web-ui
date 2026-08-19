// Location: ./client/server/test/auth.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import { buildTestApp, type TestApp } from "./helpers/build-app.js";

function mockUpstreamLogin(ok: boolean, body: unknown, status = ok ? 200 : 401): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })),
  );
}

async function login(app: TestApp): Promise<{ cookies: string[]; csrfToken: string }> {
  mockUpstreamLogin(true, {
    access_token: "upstream-jwt", // pragma: allowlist secret
    user: { email: "user@example.com", is_admin: false },
  });

  const response = await app.fastify.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "user@example.com", password: "secret" }, // pragma: allowlist secret
  });

  expect(response.statusCode).toBe(200);
  const cookies = response.cookies.map((c) => `${c.name}=${c.value}`);
  const csrfToken = response.json().csrfToken as string;
  expect(csrfToken).toBeTruthy();
  return { cookies, csrfToken };
}

describe("POST /auth/login", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never returns the upstream access_token to the browser", async () => {
    const app = await buildTestApp();
    mockUpstreamLogin(true, {
      access_token: "upstream-jwt", // pragma: allowlist secret
      user: { email: "user@example.com", is_admin: false },
    });

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "secret" }, // pragma: allowlist secret
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain("upstream-jwt");
    const setCookieNames = response.cookies.map((c) => c.name);
    expect(setCookieNames).toContain("bff_sid");
    expect(setCookieNames).toContain("bff_csrf");
  });

  it("sets the session cookie's maxAge to the upstream token's own expires_in, not a fixed BFF default", async () => {
    const app = await buildTestApp();
    mockUpstreamLogin(true, {
      access_token: "upstream-jwt", // pragma: allowlist secret
      expires_in: 1200, // 20 minutes — FastAPI's default TOKEN_EXPIRY
      user: { email: "user@example.com", is_admin: false },
    });

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "secret" }, // pragma: allowlist secret
    });

    const sessionCookie = response.cookies.find((c) => c.name === "bff_sid");
    expect(sessionCookie?.maxAge).toBe(1200);
  });

  it("falls back to the BFF's default TTL if the upstream response omits expires_in", async () => {
    const app = await buildTestApp();
    mockUpstreamLogin(true, {
      access_token: "upstream-jwt", // pragma: allowlist secret
      user: { email: "user@example.com", is_admin: false },
    });

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "secret" }, // pragma: allowlist secret
    });

    const sessionCookie = response.cookies.find((c) => c.name === "bff_sid");
    expect(sessionCookie?.maxAge).toBeGreaterThan(1200); // sanity: not accidentally near-zero
  });

  it("passes through upstream failure status without leaking a session", async () => {
    const app = await buildTestApp();
    mockUpstreamLogin(false, { detail: "Invalid email or password" }, 401);

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "wrong" }, // pragma: allowlist secret
    });

    expect(response.statusCode).toBe(401);
    // A defensive clear is issued either way (see the "clears a pre-existing
    // session cookie" test below), so assert no *live* session cookie rather
    // than no Set-Cookie at all.
    const sessionCookie = response.cookies.find((c) => c.name === "bff_sid");
    expect(sessionCookie?.value ?? "").toBe("");
  });

  it("clears a pre-existing session cookie and drops its Redis session on login failure", async () => {
    const app = await buildTestApp();
    const { cookies } = await login(app);

    mockUpstreamLogin(false, { detail: "Invalid email or password" }, 401);
    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      headers: { cookie: cookies.join("; ") },
      payload: { email: "user@example.com", password: "wrong" }, // pragma: allowlist secret
    });

    expect(response.statusCode).toBe(401);
    const cleared = response.cookies.find((c) => c.name === "bff_sid");
    expect(cleared?.value).toBe("");
    // The production change clears both cookies, not just bff_sid — a path/domain
    // mismatch on the CSRF clear could otherwise leave it live without failing
    // the assertion above.
    const clearedCsrf = response.cookies.find((c) => c.name === "bff_csrf");
    expect(clearedCsrf?.value).toBe("");

    // The old session is really gone, not just the cookie cleared client-side —
    // otherwise a mutating request made right after the failed login could
    // still ride the leftover session. See contextforge-web-ui#10.
    const followUp = await app.fastify.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: cookies.join("; ") },
    });
    expect(followUp.json()).toEqual({ authenticated: false });
  });

  it("still clears cookies and responds when dropping the stale Redis session fails", async () => {
    const app = await buildTestApp();
    const { cookies } = await login(app);
    vi.spyOn(app.redis, "del").mockRejectedValueOnce(new Error("redis unavailable"));

    mockUpstreamLogin(false, { detail: "Invalid email or password" }, 401);
    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      headers: { cookie: cookies.join("; ") },
      payload: { email: "user@example.com", password: "wrong" }, // pragma: allowlist secret
    });

    // A Redis failure must not surface as a 500 in place of the intended
    // login-failure response, and must not skip the cookie clear.
    expect(response.statusCode).toBe(401);
    const cleared = response.cookies.find((c) => c.name === "bff_sid");
    expect(cleared?.value).toBe("");
  });

  it("clears a pre-existing session cookie even when the request is missing credentials", async () => {
    const app = await buildTestApp();
    const { cookies } = await login(app);

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      headers: { cookie: cookies.join("; ") },
      payload: { email: "user@example.com" },
    });

    expect(response.statusCode).toBe(400);
    const cleared = response.cookies.find((c) => c.name === "bff_sid");
    expect(cleared?.value).toBe("");
  });

  it("clears a pre-existing session cookie when upstream is unreachable", async () => {
    const app = await buildTestApp();
    const { cookies } = await login(app);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      headers: { cookie: cookies.join("; ") },
      payload: { email: "user@example.com", password: "secret" }, // pragma: allowlist secret
    });

    expect(response.statusCode).toBe(502);
    const cleared = response.cookies.find((c) => c.name === "bff_sid");
    expect(cleared?.value).toBe("");
  });

  it("rejects a request missing credentials before calling upstream", async () => {
    const app = await buildTestApp();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "a@b.com" },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to establish a session if upstream 2xxs but the user is still flagged password_change_required (defensive backstop)", async () => {
    const app = await buildTestApp();
    mockUpstreamLogin(true, {
      access_token: "upstream-jwt", // pragma: allowlist secret
      user: { email: "user@example.com", password_change_required: true },
    });

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "secret" }, // pragma: allowlist secret
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("login_failed");
    expect(JSON.parse(response.json().detail).detail).toMatch(/password change required/i);
    // clearStaleSession always emits a clearing Set-Cookie for bff_sid (see
    // its doc comment) — assert it's cleared, not merely check for absence.
    const cleared = response.cookies.find((c) => c.name === "bff_sid");
    expect(cleared?.value).toBe("");
  });
});

describe("POST /auth/change-password-required", () => {
  afterEach(() => vi.unstubAllGlobals());

  const OLD_PASSWORD = "old-secret"; // pragma: allowlist secret
  const NEW_PASSWORD = "New-secret1"; // pragma: allowlist secret

  interface UpstreamCall {
    url: string;
    authorization: string | undefined;
    headers: Record<string, string>;
  }

  interface MockLegOptions {
    ok?: boolean;
    status?: number;
    body?: unknown;
  }

  interface MockUpstreamOptions {
    precondition?: MockLegOptions; // POST /auth/email/login (old password)
    bypassLogin?: MockLegOptions; // POST /auth/login (old password)
    changePassword?: MockLegOptions; // POST /auth/email/change-password
    revoke?: MockLegOptions; // POST /auth/logout
    realLogin?: MockLegOptions; // POST /auth/email/login (new password)
  }

  /** Mocks every upstream leg the route can call, and records every call made. */
  function mockUpstream(options: MockUpstreamOptions = {}): UpstreamCall[] {
    const legs = {
      // Default: upstream's own precondition check blocks with 403 — this is
      // the ONLY signal the route trusts (see finding #1: not a persisted
      // flag, which is why this leg's body carries no
      // password_change_required field at all).
      precondition: {
        ok: false,
        status: 403,
        body: {
          detail: "Password change required. Please change your password before continuing.",
        },
        ...options.precondition,
      },
      bypassLogin: {
        ok: true,
        status: 200,
        body: { access_token: "bypass-jwt", user: { email: "user@example.com" } }, // pragma: allowlist secret
        ...options.bypassLogin,
      },
      changePassword: { ok: true, status: 200, body: {}, ...options.changePassword },
      revoke: { ok: true, status: 200, body: {}, ...options.revoke },
      realLogin: {
        ok: true,
        status: 200,
        body: {
          access_token: "real-jwt", // pragma: allowlist secret
          expires_in: 1200,
          user: { email: "user@example.com" },
        },
        ...options.realLogin,
      },
    };

    const calls: UpstreamCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = (init?.headers as Record<string, string> | undefined) ?? {};
        const bodyPassword = init?.body
          ? (JSON.parse(String(init.body)) as { password?: string }).password
          : undefined;
        calls.push({ url: String(url), authorization: headers.authorization, headers });

        let leg: MockLegOptions & { ok: boolean; status: number; body: unknown };
        if (String(url).endsWith("/auth/email/change-password")) leg = legs.changePassword;
        else if (String(url).endsWith("/auth/logout")) leg = legs.revoke;
        else if (String(url).endsWith("/auth/login")) leg = legs.bypassLogin;
        else if (String(url).endsWith("/auth/email/login")) {
          leg = bodyPassword === NEW_PASSWORD ? legs.realLogin : legs.precondition;
        } else throw new Error(`unexpected upstream fetch: ${url}`);

        return {
          ok: leg.ok,
          status: leg.status,
          json: async () => leg.body,
          text: async () => JSON.stringify(leg.body),
        };
      }),
    );
    return calls;
  }

  async function requestChange(payload?: Record<string, unknown>) {
    return app!.fastify.inject({
      method: "POST",
      url: "/auth/change-password-required",
      payload: payload ?? {
        email: "user@example.com",
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      },
    });
  }

  let app: TestApp | undefined;
  beforeEach(async () => {
    app = await buildTestApp();
  });

  it("re-authenticates with the old password, changes it, then establishes a real session with the new password", async () => {
    mockUpstream();
    const response = await requestChange();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { email: "user@example.com" },
      csrfToken: expect.any(String),
    });
    const setCookieNames = response.cookies.map((c) => c.name);
    expect(setCookieNames).toContain("bff_sid");
    expect(setCookieNames).toContain("bff_csrf");
  });

  it("verifies the precondition via /auth/email/login's own 403, not a persisted flag — so a password-age or default-password block (never persisted) is honored too", async () => {
    // The precondition leg's default body (set up above) carries no
    // password_change_required field whatsoever — only its 403 status
    // matters. If the route still keyed off a persisted flag, this would 403
    // with password_change_not_required instead of succeeding.
    mockUpstream();
    const response = await requestChange();

    expect(response.statusCode).toBe(200);
  });

  it("checks the precondition (old password, /auth/email/login) before ever minting a bypass token", async () => {
    const calls = mockUpstream();
    await requestChange();

    const urls = calls.map((c) => c.url);
    expect(urls[0]).toBe(`${config.contextforgeUrl}/auth/email/login`);
    expect(urls).toContain(`${config.contextforgeUrl}/auth/login`);
    expect(urls).toContain(`${config.contextforgeUrl}/auth/email/change-password`);
    // The follow-up real login also hits /auth/email/login — appears twice.
    expect(urls.filter((u) => u === `${config.contextforgeUrl}/auth/email/login`)).toHaveLength(2);
  });

  it("sends client-IP audit headers on the change-password call, same as every other upstream call in this flow", async () => {
    const calls = mockUpstream();
    await requestChange();

    const changeCall = calls.find(
      (c) => c.url === `${config.contextforgeUrl}/auth/email/change-password`,
    );
    expect(changeCall?.headers["x-forwarded-for"]).toBeTruthy();
    expect(changeCall?.headers["x-real-ip"]).toBeTruthy();
  });

  it("revokes the bypass token upstream after a successful change", async () => {
    const calls = mockUpstream();
    await requestChange();

    const revokeCall = calls.find((c) => c.url === `${config.contextforgeUrl}/auth/logout`);
    expect(revokeCall?.authorization).toBe("Bearer bypass-jwt");
  });

  it("never leaks either upstream token (bypass or real) to the browser", async () => {
    mockUpstream();
    const response = await requestChange();

    const raw = JSON.stringify(response.json());
    expect(raw).not.toContain("bypass-jwt");
    expect(raw).not.toContain("real-jwt");
  });

  it("passes through the precondition failure status when the old password is wrong, without minting a bypass token", async () => {
    const calls = mockUpstream({
      precondition: { ok: false, status: 401, body: { detail: "Invalid email or password" } },
    });
    const response = await requestChange();

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("change_password_failed");
    expect(response.cookies.map((c) => c.name)).not.toContain("bff_sid");
    expect(calls.map((c) => c.url)).toEqual([`${config.contextforgeUrl}/auth/email/login`]);
  });

  it("rejects (and revokes the unused token) when the account does not actually require a password change", async () => {
    const calls = mockUpstream({
      precondition: {
        ok: true,
        status: 200,
        body: { access_token: "unused-jwt", user: { email: "user@example.com" } }, // pragma: allowlist secret
      },
    });
    const response = await requestChange();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "password_change_not_required" });
    expect(response.cookies.map((c) => c.name)).not.toContain("bff_sid");
    // No bypass token was ever minted — only the precondition call happened,
    // plus revoking the token that call itself returned.
    expect(calls.map((c) => c.url)).toEqual([
      `${config.contextforgeUrl}/auth/email/login`,
      `${config.contextforgeUrl}/auth/logout`,
    ]);
    expect(calls[1]?.authorization).toBe("Bearer unused-jwt");
  });

  it("passes through the change-password failure status when the new password is rejected, and still revokes the bypass token", async () => {
    const calls = mockUpstream({
      changePassword: {
        ok: false,
        status: 400,
        body: { detail: "Password must not be a commonly used password" },
      },
    });
    const response = await requestChange();

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("change_password_failed");
    expect(response.cookies.map((c) => c.name)).not.toContain("bff_sid");
    const revokeCall = calls.find((c) => c.url === `${config.contextforgeUrl}/auth/logout`);
    expect(revokeCall?.authorization).toBe("Bearer bypass-jwt");
  });

  it("reports login_after_change_failed (not change_password_failed) when the password changed but the follow-up login fails", async () => {
    const calls = mockUpstream({
      realLogin: { ok: false, status: 401, body: { detail: "unexpected" } },
    });
    const response = await requestChange();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "login_after_change_failed" });
    expect(response.cookies.map((c) => c.name)).not.toContain("bff_sid");
    // The password change itself did happen before the follow-up login failed.
    expect(calls.map((c) => c.url)).toContain(
      `${config.contextforgeUrl}/auth/email/change-password`,
    );
  });

  it("reports login_after_change_failed when the password changed but the follow-up login still reports the account as flagged", async () => {
    mockUpstream({
      realLogin: {
        body: {
          access_token: "real-jwt", // pragma: allowlist secret
          expires_in: 1200,
          user: { email: "user@example.com", password_change_required: true },
        },
      },
    });
    const response = await requestChange();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "login_after_change_failed" });
    expect(response.cookies.map((c) => c.name)).not.toContain("bff_sid");
  });

  it("returns 502 when upstream is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("upstream unreachable");
      }),
    );

    const response = await requestChange();
    expect(response.statusCode).toBe(502);
  });

  it("rejects a request missing fields before calling upstream", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await requestChange({ email: "user@example.com", oldPassword: OLD_PASSWORD });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("GET /auth/session", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports unauthenticated with no error for an anonymous visitor", async () => {
    const app = await buildTestApp();
    const response = await app.fastify.inject({ method: "GET", url: "/auth/session" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authenticated: false });
  });

  it("reports the session user and a fresh csrfToken once logged in", async () => {
    const app = await buildTestApp();
    const { cookies } = await login(app);

    const response = await app.fastify.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: cookies.join("; ") },
    });

    const payload = response.json();
    expect(payload.authenticated).toBe(true);
    expect(payload.user.email).toBe("user@example.com");
    expect(payload.csrfToken).toBeTruthy();
  });

  it("rotates the CSRF secret on login, so a pre-existing secret can't survive into the new session", async () => {
    const app = await buildTestApp();
    const first = await login(app);
    const firstCsrfCookie = first.cookies.find((c) => c.startsWith("bff_csrf="));
    expect(firstCsrfCookie).toBeTruthy();

    // Log in again while presenting the previous login's CSRF secret cookie —
    // simulates a secret planted before login (subdomain cookie tossing, a
    // plaintext hop) surviving across the login call.
    mockUpstreamLogin(true, {
      access_token: "upstream-jwt-2", // pragma: allowlist secret
      user: { email: "user@example.com", is_admin: false },
    });
    const second = await app.fastify.inject({
      method: "POST",
      url: "/auth/login",
      headers: { cookie: firstCsrfCookie! },
      payload: { email: "user@example.com", password: "secret" }, // pragma: allowlist secret
    });

    const secondCsrfCookie = second.cookies.find((c) => c.name === "bff_csrf");
    expect(secondCsrfCookie).toBeTruthy();
    expect(`bff_csrf=${secondCsrfCookie!.value}`).not.toBe(firstCsrfCookie);
  });
});

describe("POST /auth/logout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects without a valid CSRF token", async () => {
    const app = await buildTestApp();
    const { cookies } = await login(app);

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: cookies.join("; ") }, // no X-CSRF-Token
    });

    expect(response.statusCode).toBe(403);
  });

  it("clears cookies and drops the Redis session given a valid CSRF token", async () => {
    const app = await buildTestApp();
    const { cookies, csrfToken } = await login(app);

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: cookies.join("; "), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(200);
    const cleared = response.cookies.find((c) => c.name === "bff_sid");
    expect(cleared?.value).toBe("");

    // Session is really gone, not just the cookie cleared client-side.
    const followUp = await app.fastify.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: cookies.join("; ") },
    });
    expect(followUp.json()).toEqual({ authenticated: false });
  });

  it("is safe to call twice (idempotent) given a still-valid CSRF pair", async () => {
    const app = await buildTestApp();
    const { cookies, csrfToken } = await login(app);
    const headers = { cookie: cookies.join("; "), "x-csrf-token": csrfToken };

    const first = await app.fastify.inject({ method: "POST", url: "/auth/logout", headers });
    const second = await app.fastify.inject({ method: "POST", url: "/auth/logout", headers });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it("revokes the upstream JWT via FastAPI's bearer-token logout, not just the BFF session", async () => {
    const app = await buildTestApp();
    const { cookies, csrfToken } = await login(app);

    const fetchCalls: Array<{ url: string; authorization: string | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string> | undefined;
        fetchCalls.push({ url: String(url), authorization: headers?.authorization });
        return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
      }),
    );

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: cookies.join("; "), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(200);
    const revokeCall = fetchCalls.find(
      (call) => call.url === `${config.contextforgeUrl}/auth/logout`,
    );
    expect(revokeCall).toBeTruthy();
    // The stored bearer token, minted at login — never a session/cookie value.
    expect(revokeCall?.authorization).toBe("Bearer upstream-jwt");
  });

  it("still clears the BFF session even when upstream token revocation fails", async () => {
    const app = await buildTestApp();
    const { cookies, csrfToken } = await login(app);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("upstream unreachable");
      }),
    );

    const response = await app.fastify.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: cookies.join("; "), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(200);
    const cleared = response.cookies.find((c) => c.name === "bff_sid");
    expect(cleared?.value).toBe("");

    const followUp = await app.fastify.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: cookies.join("; ") },
    });
    expect(followUp.json()).toEqual({ authenticated: false });
  });
});
