// Location: ./client/server/src/lib/no-store.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// mcpgateway sets these on its own protected routes; /auth/* is BFF-owned and
// never reaches that middleware, so set them here to keep session/CSRF data out of caches.

import type { FastifyReply } from "fastify";

export function setNoStore(reply: FastifyReply): void {
  reply.header("cache-control", "no-store, private");
  reply.header("pragma", "no-cache");
  reply.header("expires", "0");
}
