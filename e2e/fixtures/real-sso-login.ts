/**
 * Drives a REAL Keycloak login form (E2E_REAL_API=true only, against the
 * `keycloak` service in docker-compose.e2e.yml). Unlike real-login.ts, there's
 * no BFF endpoint to call directly here -- the whole point of this flow is
 * the browser redirect through Keycloak's own UI, so this fills that UI's
 * actual rendered form instead of hitting an API.
 */

import type { Page } from "@playwright/test";

// Keycloak's default theme's stable field IDs (verified against a running
// 26.1 container) -- not this app's own components, so no accessible-label
// locators here.
export async function realSsoLogin(page: Page): Promise<void> {
  const username = process.env.E2E_SSO_USERNAME ?? "ssotest@example.com";
  const password = process.env.E2E_SSO_PASSWORD ?? "changeme-e2e-sso"; // pragma: allowlist secret

  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}
