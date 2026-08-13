// Location: ./client/server/test/compress.test.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Covers both halves of compressPlugin: responses get compressed (the
// stated intent), and request bodies do NOT get auto-decompressed (the
// globalDecompression: false fix — @fastify/compress defaults that to true
// under plain { global: true }, which would silently gunzip any request
// body with a Content-Encoding header fleet-wide).

import { gunzipSync, gzipSync } from "node:zlib";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import compressPlugin from "../src/plugins/compress.js";

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

describe("compressPlugin", () => {
  it("compresses a response when the client accepts gzip", async () => {
    app = Fastify();
    await app.register(compressPlugin);
    const payload = "x".repeat(2048); // above @fastify/compress's default threshold
    app.get("/big", async () => payload);

    const response = await app.inject({
      method: "GET",
      url: "/big",
      headers: { "accept-encoding": "gzip" },
    });

    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(response.rawPayload).toString()).toBe(payload);
  });

  it("does NOT auto-decompress a request body with Content-Encoding: gzip", async () => {
    app = Fastify();
    await app.register(compressPlugin);
    // Bypass the default JSON parser (which would happily gunzip-then-parse
    // if globalDecompression were on) so the route sees the raw bytes
    // exactly as they arrived off the wire.
    app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });
    app.post("/echo-raw", async (request) => {
      const buf = request.body as Buffer;
      return { firstTwoBytes: [...buf.subarray(0, 2)] };
    });

    const compressedBody = gzipSync(JSON.stringify({ hello: "world" }));
    const response = await app.inject({
      method: "POST",
      url: "/echo-raw",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      payload: compressedBody,
    });

    expect(response.statusCode).toBe(200);
    // Gzip magic number (0x1f8b): still present, i.e. still compressed —
    // proves the plugin left the request body untouched.
    expect(response.json()).toEqual({ firstTwoBytes: [0x1f, 0x8b] });
  });
});
