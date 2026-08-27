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

import { test as base, type Page } from "@playwright/test";
import { createApiMock, type ApiMock } from "./api-mock";

// Keyed by page (not fixture-to-fixture — Playwright rejects that as a cycle) so either fixture triggers setup once.
const setupByPage = new WeakMap<Page, Promise<ApiMock>>();

function setupOnce(page: Page): Promise<ApiMock> {
  let setup = setupByPage.get(page);
  if (!setup) {
    setup = (async () => {
      const mock = createApiMock(page);
      await mock.mockSession();
      await mock.mockLogin();
      return mock;
    })();
    setupByPage.set(page, setup);
  }
  return setup;
}

type AuthFixtures = {
  apiMock: ApiMock;
};

export const test = base.extend<AuthFixtures>({
  page: async ({ page }, use) => {
    await setupOnce(page);
    await use(page);
  },
  apiMock: async ({ page }, use) => {
    await use(await setupOnce(page));
  },
});

export { expect } from "@playwright/test";
