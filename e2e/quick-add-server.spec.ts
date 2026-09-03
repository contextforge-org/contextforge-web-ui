import { test, expect } from "./fixtures/api-mock";
import { APP } from "./utils/paths";
import type { CatalogServer } from "../src/generated/types";

const DEEPWIKI: CatalogServer = {
  id: "deepwiki",
  name: "DeepWiki",
  category: "RAG-as-a-Service",
  url: "https://mcp.deepwiki.com/mcp",
  auth_type: "Open",
  provider: "Devin",
  description: "Knowledge base with deep learning integration",
  transport: null,
  logo_url: "/static/catalog-icons/deepwiki.png",
};

const EXA_SEARCH: CatalogServer = {
  id: "exa-search",
  name: "Exa Search",
  category: "RAG-as-a-Service",
  url: "https://mcp.exa.ai/mcp",
  auth_type: "Open",
  provider: "Exa",
  description: "AI-powered search engine for retrieving web content",
  transport: "SSE",
};

async function mockCatalog(page: import("@playwright/test").Page, servers: CatalogServer[]) {
  await page.route("**/v1/catalog*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        servers,
        total: servers.length,
        categories: [],
        auth_types: [],
        providers: [],
      }),
    });
  });
}

async function mockRegister(
  page: import("@playwright/test").Page,
  { status = 200 }: { status?: number } = {},
) {
  await page.route("**/v1/catalog/*/register", async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(
        status === 200
          ? { success: true, server_id: "new-gateway-1", message: "registered" }
          : { detail: "boom" },
      ),
    });
  });
}

// The detected-components step lists the gateway's tools, resources, and prompts.
async function mockComponentLists(page: import("@playwright/test").Page) {
  for (const resource of ["tools", "resources", "prompts"]) {
    await page.route(`**/${resource}?*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
  }
}

async function openQuickAddDialog(page: import("@playwright/test").Page) {
  await page.route("**/gateways?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ gateways: [], nextCursor: null }),
    });
  });

  await page.goto(APP.SERVERS);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /Connect/i }).click();
  await page.getByRole("button", { name: /mcp server catalog/i }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Connect MCP server" }),
  ).toBeVisible();
}

test.describe("Quick Add server dialog", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockSession();
    await apiMock.mockPermissions();

    await page.addInitScript(() => {
      sessionStorage.setItem("mcpgateway_token", "mock-token-12345");
    });
  });

  test("registers a picked catalog entry and lands on the detected components step", async ({
    page,
  }) => {
    await mockCatalog(page, [DEEPWIKI, EXA_SEARCH]);
    await mockComponentLists(page);
    await mockRegister(page);
    await openQuickAddDialog(page);

    // Only the curated entries render, in the configured order.
    await expect(page.getByRole("radio", { name: /DeepWiki/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Exa Search/i })).toBeVisible();

    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect(continueButton).toBeDisabled();

    // The radio input is visually hidden (sr-only); a real user clicks the visible
    // card, which the associated <label> forwards to the input.
    await page.getByText("DeepWiki", { exact: true }).click();
    await expect(page.getByRole("radio", { name: /DeepWiki/i })).toBeChecked();
    await expect(continueButton).toBeEnabled();

    const registerRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/v1/catalog/deepwiki/register") && request.method() === "POST",
    );
    await continueButton.click();
    // The dialog owns the scope now, so the register body has to carry it.
    expect((await registerRequest).postDataJSON()).toMatchObject({
      visibility: "private",
      team_id: null,
    });

    // The connect form is skipped: Quick Add registers through the catalog endpoint.
    await expect(
      page.getByRole("heading", { name: "Expose MCP tools, resources, and prompts" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByLabel(/URL/i)).not.toBeVisible();
  });

  test("keeps the dialog open and reports the failure when registration fails", async ({
    page,
  }) => {
    await mockCatalog(page, [DEEPWIKI, EXA_SEARCH]);
    await mockRegister(page, { status: 500 });
    await openQuickAddDialog(page);

    await page.getByText("DeepWiki", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Unable to connect this server. Try again.")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Expose MCP tools, resources, and prompts" }),
    ).not.toBeVisible();
  });

  test("Browse full catalog closes the connect form and navigates to the full catalog", async ({
    page,
  }) => {
    await mockCatalog(page, [DEEPWIKI]);
    await openQuickAddDialog(page);

    await page.getByRole("button", { name: "server catalog" }).click();

    await expect(page).toHaveURL(new RegExp(APP.SERVER_CATALOG));
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
