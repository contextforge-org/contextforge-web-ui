/**
 * Real-backend login, shared by api-mock.ts and auth.ts. Logs in against
 * the live BFF with E2E_TEST_EMAIL/PASSWORD (E2E_REAL_API=true only).
 */

import type { Page } from "@playwright/test";

// The /auth/login response's user shape (server/src/routes/auth/login.ts) --
// AuthContext's lightweight identity, not src/types/user.ts's admin-management
// User (that one carries fields like created_at/failed_login_attempts that
// /auth/login never returns).
export interface RealLoginUser {
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  auth_provider: string;
  email_verified: boolean;
  password_change_required: boolean;
}

export interface RealLoginResult {
  csrfToken: string;
  user: RealLoginUser;
}

// Logs in against the real backend and returns both the csrfToken and the
// real user identity -- both come back in this one response, so callers
// needing the real identity (e.g. to self-identify against mocked data)
// don't need to wait for a later page navigation's /auth/session bootstrap.
export async function realLogin(page: Page): Promise<RealLoginResult> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD; // pragma: allowlist secret
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
  return (await response.json()) as RealLoginResult;
}
