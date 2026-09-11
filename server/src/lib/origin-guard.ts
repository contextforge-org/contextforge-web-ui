// Location: ./client/server/src/lib/origin-guard.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Cross-origin guard for routes that can't use double-submit CSRF (login:
// no CSRF cookie exists yet; SSE: EventSource can't set X-CSRF-Token).
//
// Origin is set by the browser and can't be overridden from script, and —
// unlike Sec-Fetch-Site's same-site verdict — an exact match isn't fooled by
// a hostile sibling origin under the same registrable domain
// (evil.example.com vs app.example.com both report Sec-Fetch-Site:
// same-site). So Origin is the primary check when present. But browsers
// don't reliably send Origin on a same-origin GET (EventSource in
// particular): Sec-Fetch-Site remains the fallback for that case rather
// than hard-failing every GET without an Origin header.

import type { FastifyRequest } from "fastify";

import { config } from "../config.js";

export function isCrossSiteRequest(request: FastifyRequest): boolean {
  return request.headers["sec-fetch-site"] === "cross-site";
}

// config.publicOrigin, when set, is the source of truth (needed behind a
// reverse proxy that isn't reflected in request.protocol/host — e.g.
// TLS-terminated without TRUST_PROXY=true). Otherwise fall back to this
// request's own scheme://host, which is only as trustworthy as
// trustProxy's X-Forwarded-* handling (see config.ts).
//
// Also the source of truth for where *this* deployment's own /oauth/callback
// proxy is reachable (see routes/proxy/oauth-callback-url.ts) — the same
// value, for the same reason: it must not be guessed client-side from
// window.location.origin, which this exact derivation replaced for
// redirect_uri in the first place (mcp-context-forge#6458).
export function resolvePublicOrigin(request: FastifyRequest): string {
  return config.publicOrigin ?? `${request.protocol}://${request.host}`;
}

// null = no Origin header to check (caller falls back to isCrossSiteRequest).
function originMismatch(request: FastifyRequest): boolean | null {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !origin) return null;
  return origin !== resolvePublicOrigin(request);
}

export function isForbiddenCrossOrigin(request: FastifyRequest): boolean {
  const mismatch = originMismatch(request);
  if (mismatch !== null) return mismatch;
  return isCrossSiteRequest(request);
}
