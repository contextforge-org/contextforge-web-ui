/**
 * Playwright fixture that exposes a typed API mock helper.
 *
 * Uses `page.route()` so tests run without a live backend. The payload
 * shapes mirror the BFF's auth routes (client/server/src/routes/auth/) and
 * `client/src/auth/AuthContext.tsx` (`User`, `LoginResponse`, `SessionResponse`).
 *
 * When E2E_REAL_API=true, methods testing the success path (default
 * `mockSession`, `mockLogin({status: 200})`) do a real login instead of
 * stubbing; error-status stubs stay mocked either way.
 */

import { test as base, expect, type Page } from "@playwright/test";
import { realLogin } from "./real-login";

const IS_REAL_API = process.env.E2E_REAL_API === "true";

export interface MockUser {
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  auth_provider: string;
  email_verified: boolean;
  password_change_required: boolean;
}

export const DEFAULT_TEST_USER: MockUser = {
  email: "test@example.com",
  full_name: "Test User",
  is_admin: true,
  is_active: true,
  auth_provider: "local",
  email_verified: true,
  password_change_required: false,
};

export const MOCK_CSRF_TOKEN = "mock-csrf-token";

export interface ApiMock {
  mockLogin(options?: { user?: MockUser; status?: number; detail?: string }): Promise<void>;
  /**
   * Mocks GET /auth/session, the SPA's bootstrap probe. Unlike the old
   * cookie-auth /app/auth/me, the BFF's /auth/session never 401s — it
   * always returns 200 with an `authenticated` flag. Pass
   * `authenticated: false` for the logged-out case; a bare call defaults to
   * a logged-in DEFAULT_TEST_USER.
   */
  mockSession(options?: { user?: MockUser; authenticated?: boolean }): Promise<void>;
  /**
   * Mocks GET /rbac/my/permissions, the caller's effective permission set
   * (see client/src/auth/AuthContext.tsx). Defaults to the `*` wildcard
   * (full access) so existing tests that don't care about RBAC keep working;
   * pass a narrower list to exercise permission-gated UI (e.g. the create
   * cards on Tools/Resources/Prompts/Gateways).
   */
  mockPermissions(options?: { permissions?: string[] }): Promise<void>;
  mockUnauthorized(urlPattern: string | RegExp): Promise<void>;
  /** Real csrfToken from this test's real login — compare against this instead of MOCK_CSRF_TOKEN when IS_REAL_API. */
  getRealCsrfToken(): Promise<string | undefined>;
  /**
   * Mocks POST /auth/change-password-required, the BFF's route used by
   * PasswordChangeRequired.tsx (client/src/pages/) after a "password change
   * required" login failure. On success it returns the same { user,
   * csrfToken } shape as /auth/login — the BFF re-authenticates with the new
   * password and establishes a real session as part of this one call.
   */
  mockChangePasswordRequired(options?: {
    user?: MockUser;
    status?: number;
    detail?: string;
  }): Promise<void>;
}

export function createApiMock(page: Page): ApiMock {
  let realSessionResponse: Promise<{ csrfToken?: string }> | undefined;
  return {
    async mockLogin({
      user = DEFAULT_TEST_USER,
      status = 200,
      detail = "Invalid credentials",
    } = {}) {
      // Only the success path skips stubbing (real login must hit the real
      // backend); explicit error statuses test client rendering and stay
      // mocked either way.
      if (IS_REAL_API && status === 200) return;
      await page.route("**/auth/login", async (route) => {
        if (status === 200) {
          await route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({
              user,
              csrfToken: MOCK_CSRF_TOKEN,
            }),
          });
          return;
        }
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: "login_failed", detail }),
        });
      });
    },

    async mockSession({ user = DEFAULT_TEST_USER, authenticated = true } = {}) {
      if (IS_REAL_API) {
        // Real login when authenticated, no-op when false, so specs testing
        // the logged-out state stay logged out.
        if (authenticated) {
          // AuthContext's own /auth/session call sets ITS token, not realLogin()'s — arm before it fires.
          realSessionResponse = page
            .waitForResponse((response) => /\/auth\/session(?:\?|$)/.test(response.url()))
            .then((response) => response.json() as Promise<{ csrfToken?: string }>);
          await realLogin(page);
        }
        return;
      }
      await page.route("**/auth/session", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            authenticated
              ? { authenticated: true, user, csrfToken: MOCK_CSRF_TOKEN }
              : { authenticated: false },
          ),
        });
      });
    },

    async mockPermissions({ permissions = ["*"] } = {}) {
      await page.route("**/rbac/my/permissions*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(permissions),
        });
      });
    },

    async mockChangePasswordRequired({
      user = DEFAULT_TEST_USER,
      status = 200,
      detail = "Invalid credentials",
    } = {}) {
      await page.route("**/auth/change-password-required", async (route) => {
        if (status === 200) {
          await route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({ user, csrfToken: MOCK_CSRF_TOKEN }),
          });
          return;
        }
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: "change_password_failed", detail }),
        });
      });
    },

    async mockUnauthorized(urlPattern) {
      if (IS_REAL_API) return;
      await page.route(urlPattern, async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Unauthorized" }),
        });
      });
    },

    async getRealCsrfToken() {
      return (await realSessionResponse)?.csrfToken;
    },
  };
}

type Fixtures = {
  apiMock: ApiMock;
};

export const test = base.extend<Fixtures>({
  apiMock: async ({ page }, use) => {
    await use(createApiMock(page));
  },
});

export { expect };
