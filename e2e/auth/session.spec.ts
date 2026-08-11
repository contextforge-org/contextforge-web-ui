import { test, expect } from "../fixtures/auth";
import { APP, TOKEN_STORAGE_KEY } from "../utils/paths";

test.describe("Authenticated session", () => {
  test("cookie session check lets a user reach the dashboard", async ({ page }) => {
    await page.goto(APP.ROOT);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    // Polled rather than read once: Vite can trigger a full reload on this page
    // (dep pre-bundling), which destroys the execution context mid-evaluate.
    await expect
      .poll(() =>
        page.evaluate((key) => window.sessionStorage.getItem(key), TOKEN_STORAGE_KEY),
      )
      .toBeNull();
  });
});
