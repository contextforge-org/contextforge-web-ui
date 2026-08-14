import { test, expect, MOCK_CSRF_TOKEN } from "./fixtures/api-mock";
import { APP } from "./utils/paths";
import type { CatalogServer } from "../src/generated/types";

const CATALOG_ROUTE = (url: URL) => /^(?:\/api)?\/v1\/catalog$/.test(url.pathname);
const REGISTER_ROUTE = (url: URL) =>
  /^(?:\/api)?\/v1\/catalog\/open-notes\/register$/.test(url.pathname);

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

const OPEN_SERVER = {
  id: "open-notes",
  name: "Public Notes",
  category: "Productivity",
  url: "https://notes.example/mcp",
  auth_type: "Open",
  provider: "Example",
  description: "Search public notes and documents",
  tags: ["search", "documents"],
  transport: "STREAMABLEHTTP",
  is_available: true,
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

  test("filters servers by category through the filters popover", async ({ page }) => {
    await mockCatalog(page, [OPEN_CONNECTED, OPEN_AVAILABLE]);

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /^Filters(, \d+ active)?$/ }).click();
    const popover = page.getByRole("dialog", { name: "Filters" });
    await expect(popover).toBeVisible();

    const categorySection = popover.getByRole("group", { name: "Categories" });
    await categorySection.getByRole("radio", { name: "Select" }).click();
    await categorySection.getByRole("checkbox", { name: "Productivity" }).check();

    // Filters commit as they are ticked, so the popover stays open over a grid
    // that has already narrowed.
    await expect(popover).toBeVisible();
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

    const actionsButton = page.getByRole("button", { name: "Actions for Globalping" });
    await actionsButton.click();
    await page.getByRole("menuitem", { name: "View details" }).click();

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
    await expect(actionsButton).toBeFocused();

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

  test("adds an open server without refetching its card", async ({ page, apiMock }) => {
    let registered = false;
    let catalogCalls = 0;
    let registerCalls = 0;

    await page.route(CATALOG_ROUTE, async (route) => {
      catalogCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          servers: [{ ...OPEN_SERVER, is_registered: registered }],
          total: 1,
          categories: ["Productivity"],
          auth_types: ["Open"],
          providers: ["Example"],
          all_tags: ["search", "documents"],
        }),
      });
    });

    await page.route(REGISTER_ROUTE, async (route) => {
      expect(route.request().method()).toBe("POST");
      // Real mode gets a real, randomly-generated token from the real login.
      expect(route.request().headers()["x-csrf-token"]).toBe(
        apiMock.getRealCsrfToken() ?? MOCK_CSRF_TOKEN,
      );
      registerCalls += 1;
      registered = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          server_id: "gateway-public-notes",
          message: "Server registered successfully",
        }),
      });
    });

    await page.goto(APP.SERVER_CATALOG);
    await expect(page.getByRole("heading", { name: "Public Notes" })).toBeVisible();
    const catalogCallsBeforeAdd = catalogCalls;

    await page.getByRole("button", { name: "Add Public Notes" }).click();

    await expect.poll(() => registerCalls).toBe(1);
    const catalog = page.getByRole("list", { name: "Catalog servers" });
    await expect(catalog.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Public Notes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View Public Notes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Actions for Public Notes" })).toBeVisible();
    expect(catalogCalls).toBe(catalogCallsBeforeAdd);
  });

  test("removes a stale server and moves focus to its 404 notification", async ({ page }) => {
    let registrationAttempted = false;

    await page.route(CATALOG_ROUTE, async (route) => {
      const servers = registrationAttempted ? [] : [OPEN_SERVER];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ servers, total: servers.length }),
      });
    });

    await page.route(REGISTER_ROUTE, async (route) => {
      registrationAttempted = true;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Catalog server not found" }),
      });
    });

    await page.goto(APP.SERVER_CATALOG);
    await expect(page.getByRole("heading", { name: "Public Notes" })).toBeVisible();

    await page.getByRole("button", { name: "Add Public Notes" }).click();

    const notification = page.getByRole("alert");
    await expect(notification).toHaveText("Public Notes is no longer available in the catalog.");
    await expect(notification).toBeFocused();
    await expect(page.getByRole("heading", { name: "Public Notes" })).toHaveCount(0);

    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.getByRole("heading", { name: "Server catalog" })).toBeFocused();
  });

  test("scrolls the filter options without also scrolling the panel", async ({ page }) => {
    // 700px is where the panel used to start scrolling behind the already
    // scrolling options grid, putting two scrollbars on screen at once.
    await page.setViewportSize({ width: 1400, height: 700 });
    await mockCatalog(
      page,
      Array.from({ length: 40 }, (_, index) => ({
        ...OPEN_AVAILABLE,
        id: `overflow-${index}`,
        name: `Server ${index}`,
        provider: `Provider ${String(index).padStart(2, "0")}`,
      })),
    );

    await page.goto(APP.SERVER_CATALOG);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Filters(, \d+ active)?$/ }).click();
    await page.getByRole("group", { name: "Providers" }).waitFor();

    const scrollState = await page.evaluate(() => {
      const panel = document.querySelector("[data-slot=popover-content]") as HTMLElement;
      const grid = panel.querySelector("[role=group] > div:last-child") as HTMLElement;
      const scrolls = (el: HTMLElement) => el.scrollHeight > el.clientHeight;
      return { panel: scrolls(panel), grid: scrolls(grid) };
    });

    expect(scrollState.grid).toBe(true);
    expect(scrollState.panel).toBe(false);
  });
});
