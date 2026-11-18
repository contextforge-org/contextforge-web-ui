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

// The /api/* proxy hands these headers to @fastify/reply-from, which owns
// Host and hop-by-hop framing itself. The OAuth popup builds a bare fetch()
// request instead, so Host and every hop-by-hop header have to be dropped
// here: forwarding the BFF's Host would override mcpgateway's own virtual
// host, and undici rejects some connection-level headers outright.
// Conditional headers go too -- a 304 on the authorize hop would leave the
// popup with an empty body instead of the provider redirect.
const OAUTH_STRIPPED_INBOUND_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "expect",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "if-range",
  "range",
]);

export function stripOAuthInboundHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(stripInboundHeaders(headers))) {
    if (OAUTH_STRIPPED_INBOUND_HEADERS.has(key) || key.startsWith("proxy-")) continue;
    result[key] = value;
  }
  return result;
}
