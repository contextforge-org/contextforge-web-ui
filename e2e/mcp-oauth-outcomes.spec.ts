import { test, expect } from "./fixtures/auth";
import { APP } from "./utils/paths";

test("MCP server OAuth failure → dismissal → retry → fresh components", async ({
  page,
  context,
  apiMock,
}) => {
  await apiMock.mockPermissions();
  const server = {
    id: "oauth-outcomes",
    name: "OAuth outcomes server",
    url: "http://localhost:9000/mcp",
    transport: "STREAMABLEHTTP",
    enabled: true,
    reachable: true,
    visibility: "public",
    authType: "oauth",
    oauthConfig: { grant_type: "authorization_code" },
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
  };
  let authorized = false;
  let discovered = false;
  await page.route("**/v1/mcp-servers?*", (route) =>
    route.fulfill({ json: { gateways: [server], nextCursor: null } }),
  );
  await page.route(`**/v1/mcp-servers/${server.id}`, (route) => route.fulfill({ json: server }));
  await page.route("**/oauth/status?*", (route) =>
    route.fulfill({
      json: {
        [server.id]: {
          oauth_enabled: true,
          grant_type: "authorization_code",
          user_token_status: {
            status: authorized ? "valid" : "missing",
            authorized,
          },
        },
      },
    }),
  );
  await page.route("**/oauth/authorize-nonce", (route) =>
    route.fulfill({ json: { nonce: "test-nonce" } }),
  );
  await context.route("**/oauth/authorize/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!DOCTYPE html><html><body>Provider</body></html>",
    }),
  );
  await page.route(`**/oauth/fetch-tools/${server.id}`, (route) => {
    discovered = true;
    return route.fulfill({ json: { success: true, message: "Fetched components" } });
  });
  await page.route("**/tools?*", (route) =>
    route.fulfill({
      json: {
        tools: discovered
          ? [
              {
                id: "fresh-tool",
                name: "fresh_tool",
                originalName: "fresh_tool",
                title: "Fresh tool",
              },
            ]
          : [],
      },
    }),
  );
  await page.route("**/resources?*", (route) =>
    route.fulfill({
      json: {
        resources: discovered
          ? [
              {
                id: "fresh-resource",
                name: "fresh_resource",
                uri: "file:///fresh",
                title: "Fresh resource",
              },
            ]
          : [],
      },
    }),
  );
  await page.route("**/prompts?*", (route) =>
    route.fulfill({
      json: {
        prompts: discovered
          ? [
              {
                id: "fresh-prompt",
                name: "fresh_prompt",
                originalName: "fresh_prompt",
                title: "Fresh prompt",
              },
            ]
          : [],
      },
    }),
  );

  await page.goto(APP.SERVERS);
  const firstPopupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Authorize OAuth outcomes server" }).click();
  const firstPopup = await firstPopupPromise;
  await firstPopup.waitForURL(/\/oauth\/authorize\//);
  await firstPopup.evaluate(() => {
    window.opener.postMessage(
      {
        type: "oauth_callback",
        status: "error",
        error: "access_denied",
        errorDescription: "Provider denied the requested scope",
      },
      "*",
    );
    window.close();
  });
  const dialog = page.getByRole("dialog", {
    name: "OAuth authorization failed for OAuth outcomes server",
  });
  await expect(dialog.getByText("Provider denied the requested scope")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  const panel = page.getByRole("region", { name: /MCP Server details: OAuth outcomes server/ });
  await expect(panel.getByText("Authorization needed")).toBeVisible();
  await expect(page.locator(`#oauth-authorize-${server.id}`)).toBeFocused();

  const retryPopupPromise = context.waitForEvent("page");
  await panel.getByRole("button", { name: "Authorize", exact: true }).last().click();
  const retryPopup = await retryPopupPromise;
  await retryPopup.waitForURL(/\/oauth\/authorize\//);
  authorized = true;
  await retryPopup.evaluate(() => {
    window.opener.postMessage({ type: "oauth_callback", status: "success" }, "*");
    window.close();
  });
  await expect(panel.getByText("OAuth authorization successful.")).toBeVisible();
  await expect(panel.getByText("Fresh tool")).toBeVisible();
  await expect(panel.getByText("Fresh resource")).toBeVisible();
  await expect(panel.getByText("Fresh prompt")).toBeVisible();
  await expect(panel.getByText("Authorization needed")).not.toBeVisible();
});
