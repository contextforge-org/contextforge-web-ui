// Location: ./client/server/src/plugins/compress.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Global response compression (brotli > gzip > deflate, by Accept-Encoding).
// Must be registered before staticPlugin — @fastify/compress's global hook
// only wraps replies from routes registered after it. SSE routes are exempt
// automatically: proxy-sse.ts calls reply.hijack(), which skips the onSend
// chain this plugin hooks into.

import fastifyCompress from "@fastify/compress";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export default fp(
  async function compressPlugin(fastify: FastifyInstance) {
    await fastify.register(fastifyCompress, { global: true });
  },
  { name: "compressPlugin" },
);
