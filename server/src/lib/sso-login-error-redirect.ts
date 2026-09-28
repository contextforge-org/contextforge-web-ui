// Location: ./client/server/src/lib/sso-login-error-redirect.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Shared by routes/auth/sso-login.ts and routes/auth/sso-callback.ts -- both
// redirect every SSO failure back to the login page with a `sso_`-prefixed
// error code, preserving the caller's destination when known. One shared
// implementation, one argument order -- two near-identical copies previously
// existed with the arguments swapped between them.

const APP_PREFIX = "/app";
export const SSO_DEFAULT_RETURN_TO = `${APP_PREFIX}/`;
export const SSO_LOGIN_PATH = `${APP_PREFIX}/login`;

// Keycloak's own error codes (access_denied, ...) are short RFC 6749 tokens;
// URLSearchParams encodes whatever we're given either way.
export function loginErrorRedirect(code: string, returnTo?: string): string {
  const url = new URL(SSO_LOGIN_PATH, "http://placeholder");
  url.searchParams.set("error", `sso_${code}`);
  if (returnTo && returnTo !== SSO_DEFAULT_RETURN_TO) url.searchParams.set("next", returnTo);
  return url.pathname + url.search;
}
