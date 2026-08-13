// Location: ./client/server/test/static-cache-scope.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Regression test for the cache-header scoping bug: PUBLIC_DIR is deploy-
// configurable (PUBLIC_DIR env var), so a naive `pathName.includes("/assets/")`
// check false-positives on index.html whenever the deploy path itself has an
// "assets" *ancestor* directory — not just PUBLIC_DIR/assets/*. Uses its own
// file (rather than app.test.ts) because PUBLIC_DIR is read once at module
// evaluation and vitest isolates modules per test file.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

let publicDir: string;
let assetsAncestorRoot: string;

beforeAll(async () => {
  // .../assets/<random>/server/public — "assets" is an ancestor of
  // PUBLIC_DIR, not PUBLIC_DIR's own child.
  assetsAncestorRoot = await mkdtemp(path.join(tmpdir(), "assets-"));
  publicDir = path.join(assetsAncestorRoot, "server", "public");
  await mkdir(path.join(publicDir, "assets"), { recursive: true });
  await writeFile(
    path.join(publicDir, "index.html"),
    "<!doctype html><title>spa-shell-marker</title>",
  );
  await writeFile(path.join(publicDir, "assets", "index-abc123.js"), "console.log('hashed')");
  process.env.PUBLIC_DIR = publicDir;
});

afterAll(() => rm(assetsAncestorRoot, { recursive: true, force: true }));

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

describe("static plugin cache-header scoping", () => {
  it("does not long-cache index.html when PUBLIC_DIR has an 'assets' ancestor directory", async () => {
    const staticPlugin = (await import("../src/plugins/static.js")).default;
    app = Fastify();
    await app.register(staticPlugin);

    const response = await app.inject({ method: "GET", url: "/index.html" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).not.toContain("immutable");
  });

  it("still long-caches files actually under PUBLIC_DIR/assets/*", async () => {
    const staticPlugin = (await import("../src/plugins/static.js")).default;
    app = Fastify();
    await app.register(staticPlugin);

    const response = await app.inject({ method: "GET", url: "/assets/index-abc123.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });
});
