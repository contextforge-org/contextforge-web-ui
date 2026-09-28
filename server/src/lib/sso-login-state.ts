// Location: ./client/server/src/lib/sso-login-state.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// One-time PKCE verifier/nonce/returnTo, keyed by the OAuth `state` param.
// Minted by GET /auth/sso/login, consumed by GET /auth/sso/callback.

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";
import type { RedisLike } from "./session-store.js";

export const SSO_LOGIN_BINDING_COOKIE = "sso_login_binding";

export interface SsoLoginState {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  redirectUri: string;
  bindingHash: string;
}

export interface MintedSsoLogin {
  state: string;
  nonce: string;
  codeChallenge: string;
  binding: string;
}

function ssoLoginStateRedisKey(state: string): string {
  return `${config.redisKeyPrefix}:sso-login-state:${state}`;
}

function hashBinding(binding: string): string {
  return createHash("sha256").update(binding).digest("base64url");
}

export async function mintSsoLoginState(
  redis: RedisLike,
  returnTo: string,
  redirectUri: string,
): Promise<MintedSsoLogin> {
  const state = randomUUID();
  const nonce = randomUUID();
  // RFC 7636 S256: 32 random bytes -> 43-char base64url verifier, well within
  // the spec's 43-128 char range.
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  // Ties this state to the browser that requested it (set as an httpOnly
  // cookie); only the hash is stored, so a Redis dump alone isn't usable.
  const binding = randomBytes(32).toString("base64url");

  const record: SsoLoginState = {
    codeVerifier,
    nonce,
    returnTo,
    redirectUri,
    bindingHash: hashBinding(binding),
  };
  await redis.setex(
    ssoLoginStateRedisKey(state),
    config.ssoLoginStateTtlSeconds,
    JSON.stringify(record),
  );

  return { state, nonce, codeChallenge, binding };
}

// GETDEL -- single-use, same rationale as oauth-authorize-nonce.ts: a
// captured/replayed `state` must not be reusable even by the same caller.
export async function consumeSsoLoginState(
  redis: RedisLike,
  state: string | undefined,
  binding: string | undefined,
): Promise<SsoLoginState | null> {
  if (!state) return null;
  const raw = await redis.getdel(ssoLoginStateRedisKey(state));
  if (!raw) return null;

  let record: SsoLoginState;
  try {
    record = JSON.parse(raw) as SsoLoginState;
  } catch {
    return null;
  }

  if (!binding) return null;
  const expected = Buffer.from(record.bindingHash);
  const actual = Buffer.from(hashBinding(binding));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  return record;
}
