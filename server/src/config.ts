// Location: ./client/server/src/config.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Env-driven config for the BFF. All values have dev-safe defaults; override
// via env in every non-local deployment (COOKIE_SECURE and FASTAPI_URL in
// particular).

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// Distinct from `optional`: for values with no fallback, `KEY=` (empty string)
// must mean "unset", not "explicitly set to empty" — otherwise `??` downstream
// treats "" as a real value instead of falling through.
function optionalUnset(name: string): string | undefined {
  return process.env[name] || undefined;
}

// RFC 7230 token chars — blocks CR/LF/space/separators (header-injection guard).
const HTTP_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export const config = {
  port: Number(optional("PORT", "3000")),
  host: optional("HOST", "0.0.0.0"),

  // Upstream ContextForge API (FastAPI). All bearer-token traffic goes here,
  // server-to-server only — the browser never talks to this origin directly.
  fastapiUrl: optional("FASTAPI_URL", "http://127.0.0.1:4444"),

  // Header mcpgateway reads the bearer token from — must match its own AUTH_HEADER_NAME.
  fastapiAuthHeaderName: optional("FASTAPI_AUTH_HEADER_NAME", "Authorization"),

  // memory:// (default) = in-process store, no Redis needed — dev only.
  // See lib/memory-redis.ts. Use a real redis:// URL beyond a single
  // local dev process.
  redisUrl: optional("REDIS_URL", "memory://"),

  // Opaque session_id -> { bearerToken, user } TTL in Redis. Independent of
  // the upstream JWT's own expiry; the BFF just stops trusting a stale
  // session key once this elapses.
  sessionTtlSeconds: Number(optional("SESSION_TTL_SECONDS", "86400")),

  // Redis key namespace, in case multiple BFF deployments (staging/prod)
  // ever share one Redis instance.
  redisKeyPrefix: optional("REDIS_KEY_PREFIX", "bff"),

  cookieDomain: optionalUnset("COOKIE_DOMAIN"), // undefined = host-only cookie
  cookieSecure: optional("COOKIE_SECURE", "true") === "true",

  // Exact scheme://host the BFF is publicly reached at, for Origin-header
  // validation on routes that can't use CSRF tokens (see lib/origin-guard.ts).
  // undefined = derive from the request itself (request.protocol/host) —
  // fine for a single-hostname deployment, but set this explicitly behind a
  // reverse proxy where that derivation isn't trustworthy (e.g.
  // TLS-terminated without TRUST_PROXY=true), or where request.host can't
  // be relied on for other reasons.
  publicOrigin: optionalUnset("PUBLIC_ORIGIN"),

  // Trust X-Forwarded-For so request.ip is the real client, not the LB. Only
  // safe behind a trusted proxy — default off so a direct-exposed BFF
  // doesn't let clients forge their own IP. Opt in with TRUST_PROXY=true.
  trustProxy: optional("TRUST_PROXY", "false") === "true",

  // SPA build directory (see plugins/static.ts). undefined = default,
  // computed relative to that plugin's own file location
  // (`npm run build` -> server/public/). Override
  // for a non-standard layout, or to point at a temp dir in tests.
  publicDir: optionalUnset("PUBLIC_DIR"),

  // Session-revocation re-check cadence for long-lived SSE connections
  // (Option A from agent-output/bff-proxy-and-sse-plan.md — bounded staleness,
  // no pub/sub required). Revisit if instant revocation becomes a hard requirement.
  sseSessionRecheckSeconds: Number(optional("SSE_SESSION_RECHECK_SECONDS", "15")),

  logLevel: optional("LOG_LEVEL", "info"),
} as const;

// NODE_ENV isn't reliably set by the start script, so also fail closed on COOKIE_SECURE=true (prod's default).
if (
  config.redisUrl.startsWith("memory://") &&
  (process.env.NODE_ENV === "production" || config.cookieSecure)
) {
  throw new Error("REDIS_URL=memory:// is dev-only — set a real redis:// URL in production");
}

if (!HTTP_TOKEN_RE.test(config.fastapiAuthHeaderName)) {
  throw new Error(
    `FASTAPI_AUTH_HEADER_NAME "${config.fastapiAuthHeaderName}" is not a valid HTTP header token`,
  );
}

// COOKIE_SECURE=true (prod default) with neither PUBLIC_ORIGIN nor TRUST_PROXY
// set means origin-guard.ts derives its expected origin from request.protocol,
// which is wrong behind a TLS-terminating proxy (it reads "http" while the
// browser sends "https"). That silently 403s every login and SSE connection,
// so fail fast at boot instead of at the first request.
if (config.cookieSecure && !config.publicOrigin && !config.trustProxy) {
  throw new Error(
    "COOKIE_SECURE=true requires either PUBLIC_ORIGIN or TRUST_PROXY=true, " +
      "otherwise origin-guard.ts can't validate Origin behind a reverse proxy " +
      "(request.protocol won't reflect TLS termination). Set PUBLIC_ORIGIN to " +
      "this deployment's exact scheme://host, or TRUST_PROXY=true if the BFF " +
      "is directly TLS-terminated.",
  );
}
