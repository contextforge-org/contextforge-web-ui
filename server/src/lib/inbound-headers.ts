// Location: ./client/server/src/lib/inbound-headers.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Inbound headers that must never reach mcpgateway verbatim: bff_sid/bff_csrf
// (Cookie) are BFF-only secrets; the rest are infra/auth headers mcpgateway
// trusts for request-URL construction (Forwarded/X-Forwarded-*, including
// OAuth redirect URLs) or for the bearer token itself (Authorization / the
// configured CONTEXTFORGE_AUTH_HEADER_NAME). None of these are on the Fetch
// spec's forbidden-header list, so a browser tab can set them via fetch()
// directly — strip all of them and let the proxy inject its own values,
// rather than only overwriting the ones we happen to already set.
//
// Shared by catch-all.ts's /api/* proxy and the OAuth popup hops in
// oauth-upstream-forward.ts: the popup's first hop may authenticate through
// an external proxy's identity header instead of the bearer token, so it has
// to keep the same inbound headers the catch-all keeps.

import { config } from "../config.js";

const STRIPPED_INBOUND_HEADERS = new Set([
  "cookie",
  "authorization",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
]);

export function stripInboundHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const authHeaderKey = config.contextforgeAuthHeaderName.toLowerCase();
  const result: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (STRIPPED_INBOUND_HEADERS.has(key) || key === authHeaderKey) continue;
    result[key] = value;
  }
  return result;
}
