/**
 * Mocked Keycloak SSO login flow.
 *
 * The real round trip -- browser redirected to Keycloak's own login UI,
 * then back to the BFF's /auth/sso/callback, which exchanges the code and
 * calls establishSession() -- can't be driven through a real IdP in the
 * mocked suite (see "Real Keycloak SSO login flow" below). What's testable end to end
 * through a real browser, without any backend, is the client-side contract
 * that round trip feeds into: Login.tsx's full-page redirect out and back,
 * the post-redirect session bootstrap, the generic error rendering for any
 * sso_* failure code, and logout. Same scope boundary as
 * oauth-authorization.spec.ts draws for the OAuth popup flow -- stub only
 * the hop that can't run here, let everything else run for real.
 */
import { test, expect, DEFAULT_TEST_USER, MOCK_CSRF_TOKEN } from "../fixtures/api-mock";
import { realSsoLogin } from "../fixtures/real-sso-login";
import { API, APP } from "../utils/paths";
import type { Page } from "@playwright/test";

const IS_REAL_API = process.env.E2E_REAL_API === "true";

// Switches /auth/session from unauthenticated to authenticated across a real
// page navigation, not a request count -- React StrictMode double-fires
// AuthContext's session effect even on the login page's own first load, so
// counting requests flips too early. Tying the flip to the main frame
// actually navigating away from the login page is what the real flow does
// too (a fresh document loads after the redirect), so it's correct
// regardless of how many times either page's effects fire.
async function mockSessionTransition(page: Page): Promise<void> {
  let authenticated = false;
  page.on("framenavigated", (frame) => {
    // Both directions -- logout navigates back to the login page, which
    // must flip this back to false or it loops straight back out.
    if (frame === page.mainFrame()) {
      authenticated = !frame.url().includes(APP.LOGIN);
    }
  });
  await page.route(API.SESSION, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        authenticated
          ? {
              authenticated: true,
              user: DEFAULT_TEST_USER,
              csrfToken: MOCK_CSRF_TOKEN,
              ssoEnabled: true,
              providerName: "Keycloak",
            }
          : { authenticated: false, ssoEnabled: true, providerName: "Keycloak" },
      ),
    });
  });
}

test.describe("Mocked Keycloak SSO login flow", () => {
  // Pure client-side contract tests -- no real backend involved. A faked
  // /auth/session has no real cookie behind it, so under E2E_REAL_API every
  // other proxied call 401s and bounces back to /app/login, racing these
  // tests. "Real Keycloak SSO login flow" below is the E2E_REAL_API coverage.
  test.skip(IS_REAL_API, "mocked-only, see 'Real Keycloak SSO login flow'");

  test.beforeEach(async ({ apiMock }) => {
    await apiMock.mockSession({
      authenticated: false,
      ssoEnabled: true,
      providerName: "Keycloak",
    });
    await apiMock.mockPermissions();
  });

  test('clicking "Sign in with Keycloak" navigates away, and a successful callback lands authenticated', async ({
    page,
  }) => {
    await mockSessionTransition(page);
    // Stands in for the entire server-side code-exchange + establishSession()
    // round trip -- sso-callback.ts's own success path ends in exactly this
    // kind of redirect to the original `next`.
    await page.route(API.SSO_LOGIN, async (route) => {
      await route.fulfill({ status: 302, headers: { location: APP.ROOT } });
    });

    await page.goto(APP.LOGIN);
    await page.getByRole("button", { name: /Sign in with Keycloak/i }).click();

    await page.waitForURL(new RegExp(`${APP.ROOT}$`));
    // Not a heading match -- that text is data-dependent. Home nav is the
    // stable "landed, not bounced to /login" signal (see login-flow.spec.ts).
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  });

  test("a Keycloak-side error redirects to the login page with the generic SSO error message", async ({
    page,
  }) => {
    // The exact shape sso-callback.ts's loginErrorRedirect("access_denied", ...)
    // produces -- nothing client-side calls the callback directly, so there's
    // no network hop to mock here, just its redirect target.
    await page.goto(`${APP.LOGIN}?error=sso_access_denied`);

    await expect(page.getByRole("alert")).toHaveText(
      "Single sign-on failed. Please try again or use your email and password.",
    );
    // Login.tsx's own cleanup effect strips the param after mount.
    await expect(page).toHaveURL(APP.LOGIN);
  });

  test("logout clears the session and returns to the login page", async ({ page }) => {
    await mockSessionTransition(page);
    await page.route(API.SSO_LOGIN, async (route) => {
      await route.fulfill({ status: 302, headers: { location: APP.ROOT } });
    });
    await page.goto(APP.LOGIN);
    await page.getByRole("button", { name: /Sign in with Keycloak/i }).click();
    await page.waitForURL(new RegExp(`${APP.ROOT}$`));

    await page.route("**/auth/logout", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.getByRole("button", { name: "Test User" }).click();
    await page.getByRole("button", { name: "Sign Out" }).click();

    await expect(page).toHaveURL(APP.LOGIN);
    await expect(page.getByLabel("Password")).toBeVisible();
  });
});

async function loginThroughRealKeycloak(page: Page): Promise<void> {
  await page.goto(APP.LOGIN);
  await page.getByRole("button", { name: /Sign in with Keycloak/i }).click();
  // Real Keycloak's own login form now, not this app's.
  await realSsoLogin(page);
  await page.waitForURL(new RegExp(`${APP.ROOT}$`));
}

test.describe("Real Keycloak SSO login flow", () => {
  test.skip(!IS_REAL_API, "requires E2E_REAL_API=true against the real Keycloak stack");

  test("logs in through the real Keycloak form and makes a real proxied API call", async ({
    page,
  }) => {
    await loginThroughRealKeycloak(page);
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible();

    // Proves the gateway actually accepted the Keycloak-derived bearer token
    // forwarded by the BFF's proxy, not just that a BFF-side cookie exists.
    // Must go through /api/* (catch-all.ts) -- the bare path falls through
    // to the SPA shell and always 200s regardless of auth state.
    const response = await page.request.get("/api/rbac/my/permissions");
    expect(response.ok()).toBeTruthy();
  });

  test("logout clears the BFF session and ends the Keycloak SSO session too", async ({ page }) => {
    await loginThroughRealKeycloak(page);
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible();

    // Not "Test User" -- that's the mocked fixture's name. The real
    // Keycloak user's full_name comes from realm-export.json's firstName/lastName.
    await page.getByRole("button", { name: "SSO Test" }).click();
    await page.getByRole("button", { name: "Sign Out" }).click();

    // Real logout can land on a bare /app/login (client-side redirect) or on
    // /app/login?next=... (a dashboard background call 401ing first) -- both
    // are the same "actually logged out" outcome, see smoke/app-loads.spec.ts.
    await expect(page).toHaveURL(/\/app\/login(\?.*)?$/);
    await expect(page.getByLabel("Password")).toBeVisible();

    // BFF side: the session is actually gone, not just the cookie cleared
    // client-side. Same /api/* note as the login test above.
    const response = await page.request.get("/api/rbac/my/permissions");
    expect(response.status()).toBe(401);

    // Keycloak side: a live SSO session would silently re-approve this next
    // request instead of showing the login form again -- only a real IdP can catch that.
    await page.getByRole("button", { name: /Sign in with Keycloak/i }).click();
    await expect(page.locator("#username")).toBeVisible();
  });
});
