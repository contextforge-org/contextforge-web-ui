// Location: ./client/server/test/request-logging.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0

import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRequestLogController,
  isSensitivePasswordResetUrl,
} from "../src/lib/request-logging.js";
import publicPasswordResetRoute from "../src/routes/proxy/public-password-reset.js";

describe("password-reset request logging", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "/app/reset-password/plaintext-token",
    "/App/Reset-Password/plaintext-token",
    "/app/reset-password/token%2Fwith%20space?source=email",
    "/api/auth/email/reset-password/plaintext-token",
    "/API/Auth/Email/Reset-Password/plaintext-token",
    "/api/auth/email/reset-password/plaintext-token?check=true",
  ])("marks token-bearing URL as sensitive: %s", (url) => {
    expect(isSensitivePasswordResetUrl(url)).toBe(true);
  });

  it.each([
    "/app/forgot-password",
    "/api/auth/email/forgot-password",
    "/api/auth/email/admin/users",
  ])("keeps non-token URL observable: %s", (url) => {
    expect(isSensitivePasswordResetUrl(url)).toBe(false);
  });

  it("keeps reset tokens out of automatic and manual error logs", async () => {
    const token = "plaintext-reset-token"; // pragma: allowlist secret
    const logs: string[] = [];
    const app = Fastify({
      logger: {
        level: "info",
        stream: { write: (message: string) => logs.push(message) },
      },
      logController: createRequestLogController(),
    });
    await app.register(publicPasswordResetRoute);
    await app.ready();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // Even if an upstream error embeds the URL/token, only its safe type
        // is logged by the route.
        throw new TypeError(`failed request containing ${token}`);
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/auth/email/reset-password/${token}`,
    });
    await app.close();

    expect(response.statusCode).toBe(502);
    const output = logs.join("\n");
    expect(output).toContain('"operation":"validate"');
    expect(output).toContain('"errorType":"TypeError"');
    expect(output).not.toContain(token);
  });

  it("keeps tokens out of automatic logs for case-varied reset URLs", async () => {
    const token = "case-varied-plaintext-token"; // pragma: allowlist secret
    const logs: string[] = [];
    const app = Fastify({
      logger: {
        level: "info",
        stream: { write: (message: string) => logs.push(message) },
      },
      logController: createRequestLogController(),
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: `/API/Auth/Email/Reset-Password/${token}`,
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(logs.join("\n")).not.toContain(token);
  });
});
