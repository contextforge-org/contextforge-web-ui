import { test, expect } from "./fixtures/api-mock";
import { APP } from "./utils/paths";
import type { PluginSummary } from "../src/generated/types";

const GUARDRAILS: PluginSummary = {
  name: "PII Guardrails",
  description: "Detects and redacts personally identifiable information",
  author: "ContextForge",
  version: "1.2.0",
  mode: "enforce",
  priority: 10,
  hooks: ["tool_pre_invoke", "tool_post_invoke"],
  tags: ["security", "compliance"],
  status: "enabled",
  config_summary: { redact: true, threshold: 0.8, entities: ["EMAIL", "SSN"] },
};

const LOGGING: PluginSummary = {
  name: "Request Logger",
  description: "Logs request and response payloads for auditing",
  author: "Community",
  version: "0.4.1",
  mode: "disabled",
  priority: 50,
  hooks: ["http_pre_request"],
  tags: ["observability"],
  status: "disabled",
};

async function mockPlugins(
  page: import("@playwright/test").Page,
  plugins: PluginSummary[],
  globallyEnabled = true,
) {
  await page.route("**/v1/plugins*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plugins_globally_enabled: globallyEnabled,
        plugins,
        total: plugins.length,
        enabled_count: plugins.filter((plugin) => plugin.status === "enabled").length,
        disabled_count: plugins.filter((plugin) => plugin.status === "disabled").length,
      }),
    });
  });
}

test.describe("Plugins page", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockSession();

    await page.addInitScript(() => {
      sessionStorage.setItem("mcpgateway_token", "mock-token-12345");
    });
  });

  test("lists registered plugins", async ({ page }) => {
    await mockPlugins(page, [GUARDRAILS, LOGGING]);

    await page.goto(APP.PLUGINS);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();
    const list = page.getByRole("list", { name: "Catalog plugins" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "PII Guardrails" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request Logger" })).toBeVisible();
    await expect(page.getByText("2 plugins shown")).toBeVisible();
  });

  test("filters plugins by search text and reflects it in the URL", async ({ page }) => {
    await mockPlugins(page, [GUARDRAILS, LOGGING]);

    await page.goto(APP.PLUGINS);
    await page.waitForLoadState("networkidle");

    // ListSearch collapses to an icon; the button shares the input's aria-label
    // and its click handler focuses (and thereby expands) the input.
    await page.getByRole("button", { name: "Search plugins" }).click();
    await page.getByRole("searchbox", { name: "Search plugins" }).fill("logger");

    await expect(page.getByRole("heading", { name: "Request Logger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PII Guardrails" })).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("search")).toBe("logger");
  });

  test("filters plugins by hook and tag, then clears the filters", async ({ page }) => {
    await mockPlugins(page, [GUARDRAILS, LOGGING]);

    await page.goto(APP.PLUGINS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /^Filters(, \d+ active)?$/ }).click();
    await page.getByRole("combobox", { name: "Hook" }).click();
    await page.getByRole("option", { name: "http_pre_request" }).click();

    await expect.poll(() => new URL(page.url()).searchParams.get("hook")).toBe("http_pre_request");
    await expect(page.getByRole("heading", { name: "Request Logger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PII Guardrails" })).toHaveCount(0);

    await page.getByRole("checkbox", { name: "observability" }).check();
    await expect
      .poll(() => new URL(page.url()).searchParams.getAll("tags"))
      .toContain("observability");

    await page.getByRole("button", { name: "Clear" }).click();

    await expect.poll(() => new URL(page.url()).searchParams.has("hook")).toBe(false);
    await expect(page.getByRole("heading", { name: "PII Guardrails" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request Logger" })).toBeVisible();
  });

  test("toggles between all plugins and enabled-only view", async ({ page }) => {
    await mockPlugins(page, [GUARDRAILS, LOGGING]);

    await page.goto(APP.PLUGINS);
    await page.waitForLoadState("networkidle");

    const viewToggle = page.getByRole("group", { name: "Plugins view" });
    await viewToggle.getByRole("button", { name: "Enabled" }).click();

    await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBe("enabled");
    await expect(page.getByRole("heading", { name: "PII Guardrails" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request Logger" })).toHaveCount(0);

    await viewToggle.getByRole("button", { name: "All" }).click();
    await expect(page.getByRole("heading", { name: "Request Logger" })).toBeVisible();
  });

  test("opens the read-only plugin details dialog with configuration", async ({ page }) => {
    await mockPlugins(page, [GUARDRAILS, LOGGING]);

    await page.goto(APP.PLUGINS);
    await page.waitForLoadState("networkidle");

    const viewButton = page.getByRole("button", { name: "View PII Guardrails" });
    await viewButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "PII Guardrails" })).toBeVisible();
    await expect(dialog.getByText("ContextForge", { exact: true })).toBeVisible();
    await expect(dialog.getByText("enforce", { exact: true })).toBeVisible();
    await expect(dialog.getByText("tool_pre_invoke", { exact: true })).toBeVisible();
    await expect(dialog.getByText("security", { exact: true })).toBeVisible();
    // exact: true — "redact" is otherwise a substring of the plugin description.
    await expect(dialog.getByText("redact", { exact: true })).toBeVisible();
    await expect(dialog.getByText('["EMAIL","SSN"]', { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(viewButton).toBeFocused();
  });

  test("shows a banner when the plugin subsystem is globally disabled", async ({ page }) => {
    await mockPlugins(page, [], false);

    await page.goto(APP.PLUGINS);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(
        "The plugin subsystem is disabled for this gateway. Enable it in the gateway configuration to view registered plugins.",
      ),
    ).toBeVisible();
    // The global header search box has its own "Search" label, so scope by name
    // rather than checking for an absence of any searchbox on the page.
    await expect(page.getByRole("searchbox", { name: "Search plugins" })).toHaveCount(0);
  });

  test("shows a generic error state and retries the request", async ({ page }) => {
    // A flag (not a request counter) survives React StrictMode's double-invoked
    // effect on first mount, which would otherwise fire two initial requests.
    let shouldFail = true;

    await page.route("**/v1/plugins*", async (route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Internal server error" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plugins_globally_enabled: true,
          plugins: [GUARDRAILS],
          total: 1,
          enabled_count: 1,
          disabled_count: 0,
        }),
      });
    });

    await page.goto(APP.PLUGINS);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("alert")).toHaveText("Unable to load plugins. Try again.");

    shouldFail = false;
    await page.getByRole("button", { name: "Retry" }).click();

    await expect(page.getByRole("heading", { name: "PII Guardrails" })).toBeVisible();
  });
});
