// Location: ./client/server/src/lib/upstream-auth.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Bearer header for calls to mcpgateway — name configurable via
// FASTAPI_AUTH_HEADER_NAME (see config.ts), so proxy/SSE/logout stay in sync.

import { config } from "../config.js";

const AUTH_HEADER_KEY = config.fastapiAuthHeaderName.toLowerCase();

export function upstreamAuthHeader(bearerToken: string): Record<string, string> {
  return { [AUTH_HEADER_KEY]: `Bearer ${bearerToken}` };
}
