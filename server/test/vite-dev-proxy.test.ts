// Location: ./client/server/test/vite-dev-proxy.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// VITE_DEV_SERVER_URL must be set before src/config.ts (and plugins/vite-dev-proxy.ts,
// transitively) is first evaluated — same env-ordering constraint as
// app.test.ts/proxy.test.ts — so a fake Vite dev server is spun up and
// process.env.VITE_DEV_SERVER_URL set in beforeAll, with modules under test
// dynamic-imported afterwards.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

let viteServer: Server;
let lastViteRequestPath: string | undefined;

beforeAll(async () => {
  viteServer = createServer((req, res) => {
    lastViteRequestPath = req.url;
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end("console.log('from vite')");
  });
  await new Promise<void>((resolve) => viteServer.listen(0, "127.0.0.1", () => resolve()));
  const { port } = viteServer.address() as AddressInfo;
  process.env.VITE_DEV_SERVER_URL = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => viteServer.close(() => resolve())));

async function buildApp(): Promise<{
  fastify: FastifyInstance;
  redis: import("./helpers/build-app.js").FakeRedis;
}> {
  const { FakeRedis } = await import("./helpers/build-app.js");
  const cookiePlugin = (await import("../src/plugins/cookie.js")).default;
  const sessionPlugin = (await import("../src/plugins/session.js")).default;
  const viteDevProxyPlugin = (await import("../src/plugins/vite-dev-proxy.js")).default;
  const appRoute = (await import("../src/routes/app.js")).default;

  const fastify = Fastify();
  const redis = new FakeRedis();
  fastify.decorate("redis", redis as unknown as Redis);
  await fastify.register(cookiePlugin);
  await fastify.register(sessionPlugin);
  // Same order as src/index.ts: the proxy plugin registers before appRoute's
  // own GET /. Fastify throws a duplicate-route error at registration time
  // if @fastify/http-proxy's `routes: ["/*"]` option didn't actually suppress
  // its default bare "/" registration -- this is the regression guard for
  // that assumption, not just an inline comment asserting it.
  await fastify.register(viteDevProxyPlugin);
  await fastify.register(appRoute);

  return { fastify, redis };
}

let app: Awaited<ReturnType<typeof buildApp>>;

afterEach(async () => {
  await app?.fastify.close();
});

describe("vite-dev-proxy + app route registration", () => {
  it("starts without a duplicate-route error when both are registered", async () => {
    app = await buildApp();
    await expect(app.fastify.ready()).resolves.not.toThrow();
  });

  it("lets routes/app.ts's GET / own the auth-aware redirect instead of proxying to Vite", async () => {
    app = await buildApp();
    const response = await app.fastify.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/app/login");
    expect(lastViteRequestPath).toBeUndefined();
  });

  it("proxies every other path to the Vite dev server", async () => {
    app = await buildApp();
    const response = await app.fastify.inject({ method: "GET", url: "/src/main.tsx" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("console.log('from vite')");
    expect(lastViteRequestPath).toBe("/src/main.tsx");
  });
});
