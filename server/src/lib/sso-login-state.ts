// Location: ./client/server/src/lib/sso-login-state.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// One-time PKCE verifier/nonce/returnTo, keyed by the OAuth `state` param.
// Minted by GET /auth/sso/login, consumed by GET /auth/sso/callback.

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { config } from "../config.js";
import type { RedisLike } from "./session-store.js";

export interface SsoLoginState {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
}

export interface MintedSsoLogin {
  state: string;
  nonce: string;
  codeChallenge: string;
}

function ssoLoginStateRedisKey(state: string): string {
  return `${config.redisKeyPrefix}:sso-login-state:${state}`;
}

export async function mintSsoLoginState(
  redis: RedisLike,
  returnTo: string,
): Promise<MintedSsoLogin> {
  const state = randomUUID();
  const nonce = randomUUID();
  // RFC 7636 S256: 32 random bytes -> 43-char base64url verifier, well within
  // the spec's 43-128 char range.
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const record: SsoLoginState = { codeVerifier, nonce, returnTo };
  await redis.setex(
    ssoLoginStateRedisKey(state),
    config.ssoLoginStateTtlSeconds,
    JSON.stringify(record),
  );

  return { state, nonce, codeChallenge };
}

// GETDEL -- single-use, same rationale as oauth-authorize-nonce.ts: a
// captured/replayed `state` must not be reusable even by the same caller.
export async function consumeSsoLoginState(
  redis: RedisLike,
  state: string | undefined,
): Promise<SsoLoginState | null> {
  if (!state) return null;
  const raw = await redis.getdel(ssoLoginStateRedisKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SsoLoginState;
  } catch {
    return null;
  }
}
