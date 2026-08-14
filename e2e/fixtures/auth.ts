/**
 * Authenticated-page fixture.
 *
 * Extends the base Playwright test with:
 *   - an `apiMock` with `/auth/session` + `/auth/login` pre-stubbed.
 *
 * Tests import from here when they need to skip the login form and land
 * directly on an authenticated route.
 *
 * When E2E_REAL_API=true (npm run e2e:docker), a real login is performed
 * against the live BFF instead of stubbing, and the session cookie carries into `page`.
 */

import { test as base } from "@playwright/test";
import { createApiMock, type ApiMock } from "./api-mock";
import { realLogin } from "./real-login";

const IS_REAL_API = process.env.E2E_REAL_API === "true";

type AuthFixtures = {
  apiMock: ApiMock;
};

export const test = base.extend<AuthFixtures>({
  page: async ({ page }, use) => {
    if (IS_REAL_API) {
      await realLogin(page);
    } else {
      const mock = createApiMock(page);
      await mock.mockSession();
      await mock.mockLogin();
    }
    await use(page);
  },
  apiMock: async ({ page }, use) => {
    const mock = createApiMock(page);
    if (IS_REAL_API) {
      await realLogin(page);
    } else {
      await mock.mockSession();
      await mock.mockLogin();
    }
    await use(mock);
  },
});

export { expect } from "@playwright/test";
