import { test, expect } from "../fixtures/api-mock";
import { APP, TOKEN_STORAGE_KEY } from "../utils/paths";

test.describe("Password change required flow", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockSession({ authenticated: false });
    await page.addInitScript((key) => {
      window.sessionStorage.removeItem(key);
    }, TOKEN_STORAGE_KEY);
  });

  test("successful change lands the user straight in the app, no manual re-login", async ({
    page,
    apiMock,
  }) => {
    await apiMock.mockChangePasswordRequired();

    await page.goto(`${APP.CHANGE_PASSWORD_REQUIRED}?email=test%40example.com`);
    await expect(page.getByLabel(/email address/i)).toHaveValue("test@example.com");

    await page.getByLabel(/current password/i).fill("old-password");
    await page.getByLabel(/^new password/i).fill("New-password1");
    await page.getByLabel(/confirm new password/i).fill("New-password1");
    await page.getByRole("button", { name: /change password/i }).click();

    await expect(page).toHaveURL(new RegExp(`${APP.ROOT}$`));
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });

  test("password changed but auto sign-in failed shows a fallback screen back to login", async ({
    page,
  }) => {
    await page.route("**/auth/change-password-required", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "login_after_change_failed" }),
      });
    });

    await page.goto(`${APP.CHANGE_PASSWORD_REQUIRED}?email=test%40example.com`);
    await page.getByLabel(/current password/i).fill("old-password");
    await page.getByLabel(/^new password/i).fill("New-password1");
    await page.getByLabel(/confirm new password/i).fill("New-password1");
    await page.getByRole("button", { name: /change password/i }).click();

    await expect(page.getByRole("status")).toHaveText(/password changed/i);
    await page.getByRole("button", { name: /return to login/i }).click();
    await expect(page).toHaveURL(new RegExp(`${APP.LOGIN}$`));
  });

  test("invalid old password shows a fallback link to forgot-password", async ({
    page,
    apiMock,
  }) => {
    await apiMock.mockChangePasswordRequired({ status: 401 });

    await page.goto(`${APP.CHANGE_PASSWORD_REQUIRED}?email=test%40example.com`);
    await page.getByLabel(/current password/i).fill("wrong-old-password");
    await page.getByLabel(/^new password/i).fill("New-password1");
    await page.getByLabel(/confirm new password/i).fill("New-password1");
    await page.getByRole("button", { name: /change password/i }).click();

    await expect(page.getByRole("alert")).toHaveText(/current password is incorrect/i);
    await page.getByRole("button", { name: /forgot your password/i }).click();
    await expect(page).toHaveURL(new RegExp(`${APP.FORGOT_PASSWORD}$`));
  });

  test("mismatched new passwords are rejected client-side", async ({ page }) => {
    await page.goto(`${APP.CHANGE_PASSWORD_REQUIRED}?email=test%40example.com`);
    await page.getByLabel(/current password/i).fill("old-password");
    await page.getByLabel(/^new password/i).fill("New-password1");
    await page.getByLabel(/confirm new password/i).fill("Different-password2");
    await page.getByRole("button", { name: /change password/i }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test("focus moves to error input field when validation fails", async ({ page }) => {
    await page.goto(`${APP.CHANGE_PASSWORD_REQUIRED}?email=test%40example.com`);

    // Trigger new password validation error
    await page.getByLabel(/current password/i).fill("old-password");
    await page.getByLabel(/^new password/i).fill("short");
    await page.getByLabel(/confirm new password/i).fill("short");
    await page.getByRole("button", { name: /change password/i }).click();

    // Verify focus moved to the new password input
    await expect(page.getByLabel(/^new password/i)).toBeFocused();
  });

  test("focus moves to submit error when server returns error", async ({ page, apiMock }) => {
    await apiMock.mockChangePasswordRequired({ status: 401 });

    await page.goto(`${APP.CHANGE_PASSWORD_REQUIRED}?email=test%40example.com`);
    await page.getByLabel(/current password/i).fill("wrong-old-password");
    await page.getByLabel(/^new password/i).fill("New-password1");
    await page.getByLabel(/confirm new password/i).fill("New-password1");
    await page.getByRole("button", { name: /change password/i }).click();

    // Verify focus moved to the error notification container
    const errorContainer = page.locator('[role="alert"]').locator("..");
    await expect(errorContainer).toBeFocused();
  });

  test("success heading receives focus after password changed but login failed", async ({
    page,
  }) => {
    await page.route("**/auth/change-password-required", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "login_after_change_failed" }),
      });
    });

    await page.goto(`${APP.CHANGE_PASSWORD_REQUIRED}?email=test%40example.com`);
    await page.getByLabel(/current password/i).fill("old-password");
    await page.getByLabel(/^new password/i).fill("New-password1");
    await page.getByLabel(/confirm new password/i).fill("New-password1");
    await page.getByRole("button", { name: /change password/i }).click();

    // Verify focus moved to the success heading
    const successHeading = page.getByRole("heading", { name: /password changed/i });
    await expect(successHeading).toBeFocused();
  });
});
