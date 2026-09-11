// Location: ./client/server/src/lib/oauth-authorize-nonce.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// One-time, session-bound nonce gating GET /oauth/authorize/:gatewayId (see
// routes/proxy/oauth-authorize-nonce.ts, routes/proxy/oauth-authorize.ts).
//
// isForbiddenCrossOrigin alone isn't enough on that route: window.open()'s
// top-level navigation carries no Origin header (GET navigations don't send
// one -- see origin-guard.ts), so the guard falls back to Sec-Fetch-Site,
// which reports "same-site" -- not "cross-site" -- for a request from a
// hostile *sibling* subdomain under the same registrable domain (e.g.
// evil.example.com against app.example.com). That sibling still rides the
// victim's SameSite=Lax session cookie on a top-level GET, so without this
// nonce it could otherwise trigger DCR registration and DB writes against a
// gateway of its choosing using the victim's session.
//
// The fix: mint the nonce only from a same-origin, CSRF-protected POST
// (fastify.csrfProtection -- the plugin already used for every other
// mutating browser->BFF call). A hostile sibling subdomain can't forge that
// POST: it doesn't have the CSRF token, which is handed to the SPA only in
// the JSON body of /auth/login and /auth/session, readable by same-origin
// script alone. The authorize route then requires this nonce and consumes
// it, so a captured or guessed authorize URL is usable at most once, and
// only by the session that minted it.

import { randomUUID } from "node:crypto";

import { config } from "../config.js";
import type { RedisLike } from "./session-store.js";

function nonceRedisKey(nonce: string): string {
  return `${config.redisKeyPrefix}:oauth-authorize-nonce:${nonce}`;
}

export async function mintOAuthAuthorizeNonce(
  redis: RedisLike,
  sessionId: string,
): Promise<string> {
  const nonce = randomUUID();
  await redis.setex(nonceRedisKey(nonce), config.oauthAuthorizeNonceTtlSeconds, sessionId);
  return nonce;
}

// GETDEL, not GET-then-DEL: reading and deleting must be one atomic op, or
// two concurrent requests for the same nonce can both read its session
// binding before either delete runs, letting both proceed. That deletes the
// nonce whether or not it matches -- a captured query string (browser
// history, a proxy access log, a copy-pasted URL) must not be replayable
// even by the same session that minted it.
export async function consumeOAuthAuthorizeNonce(
  redis: RedisLike,
  sessionId: string,
  nonce: string | undefined,
): Promise<boolean> {
  if (!nonce) return false;
  const mintedForSession = await redis.getdel(nonceRedisKey(nonce));
  return mintedForSession === sessionId;
}
