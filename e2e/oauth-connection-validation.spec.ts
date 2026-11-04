import { test, expect } from "./fixtures/auth";
import { APP } from "./utils/paths";

test.describe("Servers post-authorization connection validation", () => {
  test("authorization exposes a manual test, scope failure can be reauthorized and retested", async ({
    page,
    context,
    apiMock,
  }) => {
    await apiMock.mockPermissions();
    let authorized = false;
    let scopeFailure = true;
    let tests = 0;
    let imports = 0;
    const gateway = {
      id: "oauth-validation",
      name: "Validation server",
      url: "https://saved.example/mcp",
      transport: "STREAMABLEHTTP",
      enabled: true,
      reachable: true,
      visibility: "public",
      authType: "oauth",
      oauthConfig: { grant_type: "authorization_code" },
      createdAt: "2026-11-02T00:00:00Z",
      updatedAt: "2026-11-02T00:00:00Z",
    };
    await page.route("**/v1/mcp-servers?*", (route) =>
      route.fulfill({ json: { gateways: [gateway], nextCursor: null } }),
    );
    await page.route(`**/v1/mcp-servers/${gateway.id}`, (route) =>
      route.fulfill({ json: gateway }),
    );
    await page.route("**/oauth/status?*", (route) =>
      route.fulfill({
        json: {
          [gateway.id]: {
            oauth_enabled: true,
            grant_type: "authorization_code",
            user_token_status: { status: authorized ? "valid" : "missing", authorized },
          },
        },
      }),
    );
    await page.route("**/oauth/authorize-nonce", (route) =>
      route.fulfill({ json: { nonce: "validation-nonce" } }),
    );
    await context.route("**/oauth/authorize/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<html>Provider</html>" }),
    );
    await page.route(`**/oauth/fetch-tools/${gateway.id}`, (route) => {
      imports++;
      return route.fulfill({ json: { success: true } });
    });
    await page.route(`**/v1/mcp-servers/${gateway.id}/state?*`, (route) =>
      route.fulfill({ json: { status: "success" } }),
    );
    await page.route("**/v1/mcp-servers/test-handshake", (route) => {
      tests++;
      expect(route.request().postDataJSON()).toEqual({
        baseUrl: gateway.url,
        gatewayId: gateway.id,
        validationMode: "post_authorization",
      });
      return route.fulfill({
        json: {
          success: !scopeFailure,
          latencyMs: 3,
          stages: { token: "ok", negotiation: "ok", tools_list: scopeFailure ? "failed" : "ok" },
          errorCode: scopeFailure ? "insufficient_scope" : null,
          reauthorizationRequired: scopeFailure,
          componentCounts: scopeFailure ? null : { tools: 0 },
        },
      });
    });
    await page.goto(APP.SERVERS);
    const popupPromise = context.waitForEvent("page");
    await page.getByRole("button", { name: "Authorize Validation server" }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/oauth\/authorize\//);
    authorized = true;
    await popup.evaluate(() => {
      window.opener.postMessage({ type: "oauth_callback", status: "success" }, "*");
      window.close();
    });
    const button = page.getByRole("button", { name: "Test connection", exact: true });
    await expect(button).toBeVisible();
    expect(tests).toBe(0);
    await expect.poll(() => imports).toBe(1);
    await button.click();
    await expect(
      page.getByText(
        "The stored token lacks the required scope. Review the scopes and authorize again.",
      ),
    ).toBeVisible();
    expect(imports).toBe(1);
    const retryPopupPromise = context.waitForEvent("page");
    await page.getByRole("button", { name: "Authorize again" }).click();
    const retryPopup = await retryPopupPromise;
    await retryPopup.waitForURL(/\/oauth\/authorize\//);
    await expect(page.getByText("Connection validation failed")).toHaveCount(0);
    await retryPopup.evaluate(() => {
      window.opener.postMessage({ type: "oauth_callback", status: "success" }, "*");
      window.close();
    });
    await expect(button).toBeVisible();
    scopeFailure = false;
    await button.click();
    await expect(page.getByText("Stored authorization verified")).toBeVisible();
    await expect(page.getByText("Tools access: Passed")).toBeVisible();
    await expect(page.getByRole("status").getByText("0 tools", { exact: true })).toBeVisible();
    expect(tests).toBe(2);
  });

  test("read-only users cannot run stored-token validation", async ({ page, apiMock }) => {
    await apiMock.mockPermissions({ permissions: ["gateways.read"] });
    const gateway = {
      id: "read-only-oauth",
      name: "Read only OAuth",
      url: "https://saved.example/mcp",
      enabled: true,
      reachable: true,
      authType: "oauth",
      oauthConfig: { grant_type: "authorization_code" },
      visibility: "public",
    };
    await page.route("**/v1/mcp-servers?*", (route) =>
      route.fulfill({ json: { gateways: [gateway] } }),
    );
    await page.route(`**/v1/mcp-servers/${gateway.id}`, (route) =>
      route.fulfill({ json: gateway }),
    );
    await page.route("**/oauth/status?*", (route) =>
      route.fulfill({
        json: {
          [gateway.id]: {
            oauth_enabled: true,
            grant_type: "authorization_code",
            user_token_status: { status: "valid", authorized: true },
          },
        },
      }),
    );
    const statusResponse = page.waitForResponse(
      (response) => response.url().includes("/oauth/status?") && response.ok(),
    );
    await page.goto(APP.SERVERS);
    await statusResponse;
    await expect(page.getByText(gateway.name, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `${gateway.name} status: Active. Show details` }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Test connection", exact: true })).toHaveCount(0);
  });
});

for (const [code, guidance] of [
  [
    "redirect_uri_mismatch",
    "The provider rejected the redirect URI. Check the registered callback URL.",
  ],
  ["token_url_unreachable", "The token endpoint is unreachable. Check its URL and network access."],
]) {
  test(`callback surfaces ${code} before a token exists`, async ({ page, context, apiMock }) => {
    await apiMock.mockPermissions();
    const gateway = {
      id: "callback-error",
      name: "Callback server",
      url: "https://saved.example/mcp",
      enabled: true,
      authType: "oauth",
      oauthConfig: { grant_type: "authorization_code" },
    };
    await page.route("**/v1/mcp-servers?*", (route) =>
      route.fulfill({ json: { gateways: [gateway] } }),
    );
    await page.route("**/oauth/status?*", (route) =>
      route.fulfill({
        json: {
          [gateway.id]: {
            oauth_enabled: true,
            grant_type: "authorization_code",
            user_token_status: { status: "missing", authorized: false },
          },
        },
      }),
    );
    await page.route("**/oauth/authorize-nonce", (route) =>
      route.fulfill({ json: { nonce: "callback-nonce" } }),
    );
    await context.route("**/oauth/authorize/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<html>Provider</html>" }),
    );
    await page.goto(APP.SERVERS);
    const popupPromise = context.waitForEvent("page");
    await page.getByRole("button", { name: "Authorize Callback server" }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/oauth\/authorize\//);
    await popup.evaluate((errorCode) => {
      window.opener.postMessage(
        {
          type: "oauth_callback",
          status: "error",
          error: "oauth_error",
          errorCode,
          failedStage: "token_exchange",
          reauthorizationRequired: true,
        },
        "*",
      );
      window.close();
    }, code);
    await expect(page.getByRole("dialog").getByText(guidance)).toBeVisible();
  });
}
