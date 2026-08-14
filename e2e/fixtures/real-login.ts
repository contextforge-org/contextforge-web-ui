/**
 * Real-backend login, shared by api-mock.ts and auth.ts. Logs in against
 * the live BFF with E2E_TEST_EMAIL/PASSWORD (E2E_REAL_API=true only).
 */

import type { Page } from "@playwright/test";

// Returns the real csrfToken the BFF issued, for tests that assert on it.
export async function realLogin(page: Page): Promise<string> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_REAL_API=true requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD (see .env.example).",
    );
  }
  // page.request shares page's cookie jar, so the session cookie carries into page.goto().
  const response = await page.request.post("/auth/login", { data: { email, password } });
  if (!response.ok()) {
    throw new Error(`Real login failed: ${response.status()} ${await response.text()}`);
  }
  const { csrfToken } = (await response.json()) as { csrfToken: string };
  return csrfToken;
}
