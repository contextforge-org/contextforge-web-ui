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

  test("pre-fills the connect form from a picked catalog entry and submits a new gateway", async ({
    page,
  }) => {
    await mockCatalog(page, [DEEPWIKI, EXA_SEARCH]);
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
    await continueButton.click();

    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByLabel(/Name/i)).toHaveValue("DeepWiki");
    await expect(page.getByLabel(/URL/i)).toHaveValue("https://mcp.deepwiki.com/mcp");
    await expect(page.getByPlaceholder(/Add an optional description/i)).toHaveValue(
      "Knowledge base with deep learning integration",
    );
    await expect(page.getByRole("radio", { name: "Streamable HTTP" })).toBeChecked();

    const createRequest = page.waitForRequest(
      (request) => request.url().includes("/gateways") && request.method() === "POST",
    );
    await page.route(
      (url) => url.pathname.endsWith("/gateways") || url.pathname.endsWith("/api/gateways"),
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "new-gateway-1", name: "DeepWiki" }),
        });
      },
    );

    await page.getByRole("button", { name: /Connect server/i }).click();

    const request = await createRequest;
    const body = request.postDataJSON() as { name?: string; url?: string; transport?: string };
    expect(body.name).toBe("DeepWiki");
    expect(body.url).toBe("https://mcp.deepwiki.com/mcp");
    expect(body.transport).toBe("STREAMABLEHTTP");
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
