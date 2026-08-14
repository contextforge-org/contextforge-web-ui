import { test, expect } from "../fixtures/api-mock";
import { APP, TOKEN_STORAGE_KEY } from "../utils/paths";

const IS_REAL_API = process.env.E2E_REAL_API === "true";
// Only the "successful login" test needs a user that really exists.
const VALID_EMAIL = IS_REAL_API ? (process.env.E2E_TEST_EMAIL ?? "") : "test@example.com";
const VALID_PASSWORD = IS_REAL_API ? (process.env.E2E_TEST_PASSWORD ?? "") : "password123";

test.describe("Login flow", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockSession({ authenticated: false });
    await page.addInitScript((key) => {
      window.sessionStorage.removeItem(key);
    }, TOKEN_STORAGE_KEY);
  });

  test("successful login navigates to the dashboard", async ({ page, apiMock }) => {
    await apiMock.mockLogin();

    await page.goto(APP.LOGIN);
    await page.getByLabel(/email address/i).fill(VALID_EMAIL);
    await page.getByLabel(/password/i).fill(VALID_PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(new RegExp(`${APP.ROOT}$`));
    // Not a heading match — that text is data-dependent. Home nav is the stable "landed, not bounced to /login" signal.
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible();

    const token = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      TOKEN_STORAGE_KEY,
    );
    expect(token).toBeNull();
  });

  test("401 response keeps user on the login page without a token", async ({ page, apiMock }) => {
    await apiMock.mockLogin({ status: 401 });

    await page.goto(APP.LOGIN);
    await page.getByLabel(/email address/i).fill("wrong@example.com");
    await page.getByLabel(/password/i).fill("bad-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(new RegExp(`${APP.LOGIN}$`));
    await expect(page.getByRole("alert")).toHaveText(/invalid/i);
    const token = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      TOKEN_STORAGE_KEY,
    );
    expect(token).toBeNull();
  });

  test("403 password-change-required response redirects to the change-password page", async ({
    page,
    apiMock,
  }) => {
    await apiMock.mockLogin({
      status: 403,
      detail: JSON.stringify({
        detail: "Password change required. Please change your password before continuing.",
      }),
    });

    await page.goto(APP.LOGIN);
    await page.getByLabel(/email address/i).fill("test@example.com");
    await page.getByLabel(/password/i).fill("old-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(
      new RegExp(`${APP.CHANGE_PASSWORD_REQUIRED}\\?email=test%40example\\.com$`),
    );
  });

  test("403 response with unrelated detail keeps user on the login page", async ({
    page,
    apiMock,
  }) => {
    await apiMock.mockLogin({ status: 403, detail: JSON.stringify({ detail: "Forbidden" }) });

    await page.goto(APP.LOGIN);
    await page.getByLabel(/email address/i).fill("test@example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(new RegExp(`${APP.LOGIN}$`));
    await expect(page.getByRole("alert")).toHaveText(/login failed/i);
  });

  test("500 response surfaces generic failure message", async ({ page, apiMock }) => {
    await apiMock.mockLogin({ status: 500 });

    await page.goto(APP.LOGIN);
    await page.getByLabel(/email address/i).fill("test@example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page.getByRole("alert")).toHaveText(/login failed/i);
  });

  test("submit button shows loading state during request", async ({ page }) => {
    // Delay the response so the loading state is observable.
    await page.route("**/auth/login", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            email: "test@example.com",
            full_name: "Test User",
            is_admin: true,
            is_active: true,
            auth_provider: "local",
            email_verified: true,
            password_change_required: false,
          },
          csrfToken: "mock-csrf-token",
        }),
      });
    });

    await page.goto(APP.LOGIN);
    await page.getByLabel(/email address/i).fill("test@example.com");
    await page.getByLabel(/password/i).fill("password123");

    const submit = page.getByRole("button", { name: /sign in|signing in/i });
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText(/signing in/i);
  });
});
