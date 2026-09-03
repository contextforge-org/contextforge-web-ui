/**
 * OAuth authorization-code popup flow (mcp-context-forge#6458).
 *
 * The real round trip -- BFF proxies GET /oauth/authorize/{id} to mcpgateway,
 * which 302s to the OAuth provider; the provider redirects back to
 * /oauth/callback, which the BFF also proxies; that page posts the result to
 * window.opener and closes -- can't be driven through a real IdP in CI. What
 * *is* testable end to end through a real browser, without any backend, is
 * the client-side contract those two hops feed into: triggerOAuthAuthorization
 * (client/src/api/servers.ts) opens the popup, listens for a same-window
 * postMessage, and resolves/rejects the promise that drives the form's
 * pending/success/error states. This stubs the popup's very first navigation
 * (the oauth/authorize route) with the exact HTML shape mcpgateway's own
 * _popup_notification_script produces, so the assertion is: does the whole
 * chain from clicking "Connect server" to the success notification actually
 * work, not just each piece in isolation (already covered by
 * src/api/servers.test.ts and server/test/oauth-*.test.ts).
 */
import { test, expect } from "./fixtures/auth";
import { APP } from "./utils/paths";

const GATEWAY_ID = "gw-oauth-1";
const GATEWAY_NAME = "GitHub OAuth Test";

test.describe("OAuth authorization-code popup flow", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockPermissions();
    await page.route("**/gateways?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ gateways: [], nextCursor: null }),
      });
    });
  });

  test("create -> popup -> postMessage -> activate -> fetch tools", async ({ page, context }) => {
    // Registered at the browser-context level (not just this page) so it also
    // covers the popup window's own navigation, exactly like mcpgateway's
    // popup-branch callback HTML: postMessage(payload, '*') then window.close().
    await context.route("**/oauth/authorize/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!DOCTYPE html><html><body><script>
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: "oauth_callback", status: "success", gatewayId: "${GATEWAY_ID}", gatewayName: "${GATEWAY_NAME}" },
              "*"
            );
          }
          window.close();
        </script></body></html>`,
      });
    });

    await page.route("**/gateways", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: GATEWAY_ID, name: GATEWAY_NAME }),
      });
    });

    await page.route(`**/gateways/${GATEWAY_ID}/state*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "activated" }),
      });
    });

    await page.route(`**/oauth/fetch-tools/${GATEWAY_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Fetched 3 tools." }),
      });
    });

    await page.goto(APP.SERVERS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Connect/i }).click();

    await page.getByLabel("Name").fill(GATEWAY_NAME);
    await page.getByLabel("URL").fill("https://api.githubcopilot.com/mcp");

    await page.getByRole("button", { name: "Advanced settings" }).click();
    await page.getByText("OAuth 2.0", { exact: true }).click();

    await page.getByLabel(/Grant type/).click();
    await page.getByRole("option", { name: /Authorization code/i }).click();

    await page.getByLabel("Issuer URL").fill("https://github.com");
    await page.getByLabel("Client ID").fill("test-client-id");
    await page.getByLabel("Client Secret").fill("test-client-secret"); // pragma: allowlist secret
    await page.getByLabel("Authorization URL").fill("https://github.com/login/oauth/authorize");
    await page.getByLabel("Token URL").fill("https://github.com/login/oauth/access_token");

    // The auto-placeholder from the redirect_uri fix (mcp-context-forge#6458):
    // never guessed from window.location.origin, never submitted as a value.
    await expect(page.getByLabel(/Redirect URI/i)).toHaveValue(
      "Determined automatically by the server",
    );

    await page.getByRole("button", { name: "Connect server" }).click();

    await expect(
      page.getByText(/Waiting for OAuth authorization in the popup window/i),
    ).toBeVisible();
    await expect(page.getByText(/OAuth authorization successful/i)).toBeVisible();
    await expect(page.getByText(/Fetched 3 tools\./i)).toBeVisible();
  });

  test("shows an error notification when the popup posts an error result", async ({
    page,
    context,
  }) => {
    await context.route("**/oauth/authorize/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!DOCTYPE html><html><body><script>
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: "oauth_callback", status: "error", error: "access_denied", errorDescription: "User cancelled" },
              "*"
            );
          }
          window.close();
        </script></body></html>`,
      });
    });

    await page.route("**/gateways", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: GATEWAY_ID, name: GATEWAY_NAME }),
      });
    });

    await page.goto(APP.SERVERS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Connect/i }).click();
    await page.getByLabel("Name").fill(GATEWAY_NAME);
    await page.getByLabel("URL").fill("https://api.githubcopilot.com/mcp");
    await page.getByRole("button", { name: "Advanced settings" }).click();
    await page.getByText("OAuth 2.0", { exact: true }).click();
    await page.getByLabel(/Grant type/).click();
    await page.getByRole("option", { name: /Authorization code/i }).click();
    await page.getByLabel("Issuer URL").fill("https://github.com");
    await page.getByLabel("Client ID").fill("test-client-id");
    await page.getByLabel("Client Secret").fill("test-client-secret"); // pragma: allowlist secret
    await page.getByLabel("Authorization URL").fill("https://github.com/login/oauth/authorize");
    await page.getByLabel("Token URL").fill("https://github.com/login/oauth/access_token");

    await page.getByRole("button", { name: "Connect server" }).click();

    await expect(page.getByText(/User cancelled/i)).toBeVisible();
    // The form must stay open on error so the user can see it and retry.
    await expect(page.getByRole("button", { name: "Connect server" })).toBeVisible();
  });
});
