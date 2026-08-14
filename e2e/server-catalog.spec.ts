import { test, expect } from "./fixtures/api-mock";
import { APP } from "./utils/paths";
import type { CatalogServer } from "../src/generated/types";

const OPEN_CONNECTED: CatalogServer = {
  id: "open-connected",
  name: "Globalping",
  category: "Monitoring",
  url: "https://globalping.example/mcp",
  auth_type: "Open",
  provider: "jsDelivr",
  description: "Global network testing and monitoring",
  tags: ["network", "observability"],
  transport: "STREAMABLEHTTP",
  is_registered: true,
};

const OPEN_AVAILABLE: CatalogServer = {
  id: "open-available",
  name: "Public Notes",
  category: "Productivity",
  url: "https://notes.example/mcp",
  auth_type: "Open",
  provider: "Example",
  description: "Search public notes and documents",
  tags: ["search", "documents"],
  is_registered: false,
};

const API_KEY_SERVER: CatalogServer = {
  id: "api-key",
  name: "Secret Service",
  category: "Security",
  url: "https://secret.example/mcp",
  auth_type: "API Key",
  provider: "SecureCo",
  description: "Requires a secret API key",
  tags: ["security"],
  is_registered: false,
};

async function mockCatalog(page: import("@playwright/test").Page, servers: CatalogServer[]) {
  await page.route("**/v1/catalog*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ servers, total: servers.length }),
    });
  });
}

test.describe("Server catalog page", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockSession();

    await page.addInitScript(() => {
      sessionStorage.setItem("mcpgateway_token", "mock-token-12345");
    });
  });

  test("lists only Open catalog servers and marks registered ones connected", async ({ page }) => {
    await mockCatalog(page, [OPEN_CONNECTED, OPEN_AVAILABLE, API_KEY_SERVER]);

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Server catalog" })).toBeVisible();
    const catalogList = page.getByRole("list", { name: "Catalog servers" });
    await expect(catalogList.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Globalping" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Public Notes" })).toBeVisible();
    await expect(page.getByText("Secret Service")).toHaveCount(0);
    await expect(catalogList.getByText("Connected")).toBeVisible();
    await expect(page.getByText("2 servers shown")).toBeVisible();
  });

  test("filters servers by search text and reflects it in the URL", async ({ page }) => {
    await mockCatalog(page, [OPEN_CONNECTED, OPEN_AVAILABLE]);

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    // ListSearch collapses to an icon; the button shares the input's aria-label
    // and its click handler focuses (and thereby expands) the input.
    await page.getByRole("button", { name: "Search MCP servers" }).click();
    await page.getByRole("searchbox", { name: "Search MCP servers" }).fill("notes");

    await expect(page.getByRole("heading", { name: "Public Notes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Globalping" })).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("search")).toBe("notes");
  });

  test("filters servers by category through the filters dialog", async ({ page }) => {
    await mockCatalog(page, [OPEN_CONNECTED, OPEN_AVAILABLE]);

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /^Filters(, \d+ active)?$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add filters" });
    await expect(dialog).toBeVisible();

    const categorySection = dialog.getByRole("group", { name: "Categories" });
    await categorySection.getByRole("radio", { name: "Select..." }).click();
    await categorySection.getByRole("checkbox", { name: "Productivity" }).check();
    await dialog.getByRole("button", { name: "Add filters" }).click();

    await expect(dialog).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("Productivity");
    await expect(page.getByRole("heading", { name: "Public Notes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Globalping" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Filters, 1 active" })).toBeVisible();
  });

  test("toggles between all servers and connected-only view", async ({ page }) => {
    await mockCatalog(page, [OPEN_CONNECTED, OPEN_AVAILABLE]);

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    const viewToggle = page.getByRole("group", { name: "Catalog view" });
    await viewToggle.getByRole("button", { name: "Connected" }).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("show_registered_only"))
      .toBe("true");
    await expect(page.getByRole("heading", { name: "Globalping" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Public Notes" })).toHaveCount(0);

    await viewToggle.getByRole("button", { name: "All" }).click();
    await expect(page.getByRole("heading", { name: "Public Notes" })).toBeVisible();
  });

  test("opens the read-only server details dialog and returns focus on close", async ({ page }) => {
    await mockCatalog(page, [OPEN_CONNECTED, OPEN_AVAILABLE]);

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    const viewButton = page.getByRole("button", { name: "View Globalping" });
    await viewButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Globalping" })).toBeVisible();
    await expect(dialog.getByText("jsDelivr", { exact: true })).toBeVisible();
    // exact: true — "Monitoring" is otherwise a substring of the server description.
    await expect(dialog.getByText("Monitoring", { exact: true })).toBeVisible();
    await expect(dialog.getByText("STREAMABLEHTTP", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Connected", { exact: true })).toBeVisible();
    await expect(dialog.getByText("observability", { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(viewButton).toBeFocused();

    await page.getByRole("button", { name: "View Public Notes" }).click();
    await expect(page.getByRole("dialog").getByText("Not connected")).toBeVisible();
  });

  test("shows the disabled state when the catalog endpoint is unavailable", async ({ page }) => {
    await page.route("**/v1/catalog*", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not found" }),
      });
    });

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Server catalog is disabled for this gateway.")).toBeVisible();
  });

  test("shows a generic error state and retries the request", async ({ page }) => {
    // A flag (not a request counter) survives React StrictMode's double-invoked
    // effect on first mount, which would otherwise fire two initial requests.
    let shouldFail = true;

    await page.route("**/v1/catalog*", async (route) => {
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
        body: JSON.stringify({ servers: [OPEN_CONNECTED], total: 1 }),
      });
    });

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("alert")).toHaveText("Unable to load server catalog. Try again.");

    shouldFail = false;
    await page.getByRole("button", { name: "Retry" }).click();

    await expect(page.getByRole("heading", { name: "Globalping" })).toBeVisible();
  });
});
