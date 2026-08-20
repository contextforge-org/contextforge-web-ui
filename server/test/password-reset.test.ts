// Location: ./client/server/test/password-reset.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import { buildTestApp, type TestApp } from "./helpers/build-app.js";

interface UpstreamCall {
  url: string;
  init: RequestInit;
}

function mockUpstream(
  body: unknown,
  options: { status?: number; headers?: Record<string, string> } = {},
): UpstreamCall[] {
  const calls: UpstreamCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), {
        status: options.status ?? 200,
        headers: { "content-type": "application/json", ...options.headers },
      });
    }),
  );
  return calls;
}

describe("public password-reset proxy", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await buildTestApp({ withProxy: true });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await app.fastify.close();
  });

  it("lets an anonymous visitor request a reset link without forwarding browser secrets", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const calls = mockUpstream({
      success: true,
      message: "If this email is registered, you will receive a reset link.",
    });

    const response = await app.fastify.inject({
      method: "POST",
      url: "/api/auth/email/forgot-password",
      headers: {
        host: "app.example.test",
        origin: "http://app.example.test",
        "user-agent": "reset-flow-test-agent",
        authorization: "Bearer browser-supplied-token", // pragma: allowlist secret
        cookie: "next-auth.session-token=stale-browser-cookie", // pragma: allowlist secret
      },
      payload: { email: "person@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.headers["cache-control"]).toBe("no-store, private");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${config.contextforgeUrl}/auth/email/forgot-password`);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: "person@example.com" });

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers["user-agent"]).toBe("reset-flow-test-agent");
    expect(headers["x-forwarded-for"]).toBeTruthy();
    expect(timeoutSpy).toHaveBeenCalledWith(config.passwordResetRequestTimeoutMs);
  });

  it("lets an anonymous visitor validate and complete a reset token", async () => {
    const calls = mockUpstream({ valid: true, message: "Reset token is valid", expires_at: null });

    const validation = await app.fastify.inject({
      method: "GET",
      url: "/api/auth/email/reset-password/token%20with%20space",
    });
    expect(validation.statusCode).toBe(200);
    expect(validation.json().valid).toBe(true);

    const completion = await app.fastify.inject({
      method: "POST",
      url: "/api/auth/email/reset-password/token%20with%20space",
      payload: { new_password: "New-password1", confirm_password: "New-password1" },
    });
    expect(completion.statusCode).toBe(200);

    expect(calls.map((call) => call.url)).toEqual([
      `${config.contextforgeUrl}/auth/email/reset-password/token%20with%20space`,
      `${config.contextforgeUrl}/auth/email/reset-password/token%20with%20space`,
    ]);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[1]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      new_password: "New-password1",
      confirm_password: "New-password1",
    });
  });

  it("rejects cross-origin password-reset mutations before calling upstream", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await app.fastify.inject({
      method: "POST",
      url: "/api/auth/email/forgot-password",
      headers: { host: "app.example.test", origin: "https://evil.example.test" },
      payload: { email: "person@example.com" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "cross_site_request_forbidden" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes through rate limits but not upstream cookies", async () => {
    mockUpstream(
      { detail: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "retry-after": "30", "set-cookie": "upstream_session=secret; HttpOnly" }, // pragma: allowlist secret
      },
    );

    const response = await app.fastify.inject({
      method: "POST",
      url: "/api/auth/email/forgot-password",
      payload: { email: "person@example.com" },
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("30");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("keeps every other email-auth API route behind session authentication", async () => {
    const response = await app.fastify.inject({
      method: "GET",
      url: "/api/auth/email/admin/users",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });
});
