import { test, expect } from "./fixtures/api-mock";
import { APP } from "./utils/paths";
import type { ResourceRead } from "../src/generated/types";

type Resource = NonNullable<ResourceRead>;

function makeResource(id: string, gatewayId: string, overrides: Partial<Resource> = {}): Resource {
  return {
    id,
    uri: `resource://test/${id}`,
    name: id,
    description: `Description for ${id}`,
    mimeType: "text/plain",
    size: 1024,
    tags: [],
    enabled: true,
    createdAt: "2026-04-28T15:41:31.233166",
    updatedAt: "2026-04-28T15:41:31.233168",
    createdBy: "admin@example.com",
    visibility: "public",
    gatewayId,
    ...overrides,
  };
}

const RESOURCE_A1 = makeResource("document-txt", "github-server");
const RESOURCE_A2 = makeResource("config-json", "github-server", { mimeType: "application/json" });
const RESOURCE_B1 = makeResource("readme-md", "slack-server");

test.describe("Resources page", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    // Mock authentication
    await apiMock.mockSession();
    await apiMock.mockPermissions();

    // Set auth token in sessionStorage
    await page.addInitScript(() => {
      sessionStorage.setItem("mcpgateway_token", "mock-token-12345");
    });
  });

  test("shows add resources card when no resources exist", async ({ page }) => {
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Add resources")).toBeVisible();
    await expect(
      page.getByText(/Resources will appear automatically when you connect a MCP server/),
    ).toBeVisible();
  });

  test("hides add resources card when the caller lacks resources.create", async ({
    page,
    apiMock,
  }) => {
    await apiMock.mockPermissions({ permissions: ["resources.read"] });
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Resources" })).toBeVisible();
    await expect(page.getByText("Add resources")).not.toBeVisible();
  });

  test("clicking add resources card opens form", async ({ page }) => {
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await page.getByText("Add resources").click();

    await expect(page.getByLabel("URI")).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
  });

  test("shows error state when API fails", async ({ page }) => {
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Internal server error" }),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Error loading resources")).toBeVisible();
  });

  test("shows resources grouped by gateway slug", async ({ page }) => {
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([RESOURCE_A1, RESOURCE_A2, RESOURCE_B1]),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Resources" })).toBeVisible();

    await expect(page.getByText("github-server")).toBeVisible();
    await expect(page.getByText("slack-server")).toBeVisible();

    await expect(page.getByText("document-txt")).toBeVisible();
    await expect(page.getByText("config-json")).toBeVisible();
    await expect(page.getByText("readme-md")).toBeVisible();

    await expect(page.getByText("2 resources")).toBeVisible();
    await expect(page.getByText("1 resource")).toBeVisible();
  });

  test("caps badge display at 8 and shows +N overflow tag", async ({ page }) => {
    const manyResources: Resource[] = Array.from({ length: 10 }, (_, i) =>
      makeResource(`resource_${i + 1}`, "big-gateway"),
    );

    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manyResources),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("big-gateway")).toBeVisible();
    await expect(page.getByText("10 resources")).toBeVisible();

    await expect(page.getByText("resource_1")).toBeVisible();
    await expect(page.getByText("resource_8")).toBeVisible();

    await expect(page.getByText("resource_9")).not.toBeVisible();
    await expect(page.getByText("resource_10")).not.toBeVisible();
    await expect(page.getByText("+2")).toBeVisible();
  });

  test("opens more options dropdown and shows View Details item", async ({ page }) => {
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([RESOURCE_A1]),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "More options for github-server" }).click();

    await expect(page.getByRole("menuitem", { name: "View details" })).toBeVisible();
  });

  test("truncates a long gateway name and keeps the overflow menu visible", async ({ page }) => {
    // With no gateways mocked the card title falls back to the gatewayId, so a
    // long gatewayId gives us a long, overflow-prone card title.
    const longSlug =
      "github-enterprise-server-with-an-extremely-long-federated-gateway-identifier-value";
    const resources: Resource[] = [
      makeResource("document-txt", longSlug),
      makeResource("config-json", longSlug),
    ];

    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(resources),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    const kebab = page.getByRole("button", { name: `More options for ${longSlug}` });
    await expect(kebab).toBeVisible();

    const card = page.locator('[data-slot="card"]').filter({ has: kebab });
    const title = card.locator('[data-slot="card-header"] span.truncate').first();

    const isTruncated = await title.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(isTruncated).toBe(true);
    await expect(title).toHaveAttribute("title", longSlug);

    const cardBox = await card.boundingBox();
    const kebabBox = await kebab.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(kebabBox).not.toBeNull();
    expect(kebabBox!.x + kebabBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);

    await kebab.click();
    await expect(page.getByRole("menuitem", { name: "View details" })).toBeVisible();
  });

  test("opens details panel when View Details is clicked", async ({ page }) => {
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([RESOURCE_A1, RESOURCE_A2]),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "More options for github-server" }).click();
    await page.getByRole("menuitem", { name: "View details" }).click();

    const panel = page.getByRole("region", { name: /Resources for github-server/i });
    await expect(panel).toBeVisible();

    await expect(panel.getByText("document-txt").first()).toBeVisible();
    await expect(panel.getByText("config-json").first()).toBeVisible();
  });

  test("closes details panel via close button", async ({ page }) => {
    await page.route("**/resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([RESOURCE_A1]),
      });
    });

    await page.goto(APP.RESOURCES);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "More options for github-server" }).click();
    await page.getByRole("menuitem", { name: "View details" }).click();

    const panel = page.getByRole("region", { name: /Resources for github-server/i });
    await expect(panel).toBeVisible();

    await page.getByLabel("Close resource details").click();

    await expect(panel).not.toBeVisible();
  });

  test.describe("Try it preview", () => {
    test("renders a preview in the details panel Try it tab", async ({ page }) => {
      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([RESOURCE_A1]),
        });
      });

      let requestedUrl: string | null = null;
      await page.route("**/v1/resources/test/**", async (route) => {
        requestedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            content: { mimeType: "text/plain", text: "hello from document-txt" },
          }),
        });
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for github-server" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      // Try it is the default tab, so Preview is available without switching tabs.
      const panel = page.getByRole("region", { name: /Resources for github-server/i });
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Preview" }).click();

      await expect.poll(() => requestedUrl).not.toBeNull();
      expect(requestedUrl).toContain(`/v1/resources/test/${encodeURI(RESOURCE_A1.uri)}`);

      await expect(panel).toContainText("200 OK");
      await expect(panel).toContainText("hello from document-txt");
    });

    test("disables Preview until every uriTemplate placeholder is filled, then sends the resolved uri", async ({
      page,
    }) => {
      const TEMPLATED = makeResource("repo-contents", "github-server", {
        uri: "github://repos/{owner}/{repo}",
        uriTemplate: "github://repos/{owner}/{repo}",
      });

      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([TEMPLATED]),
        });
      });

      let requestedUrl: string | null = null;
      await page.route("**/v1/resources/test/**", async (route) => {
        requestedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ content: { mimeType: "text/plain", text: "readme contents" } }),
        });
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for github-server" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for github-server/i });
      const previewButton = panel.getByRole("button", { name: "Preview" });
      await expect(previewButton).toBeDisabled();

      await panel.getByLabel(/owner/).fill("ibm");
      await expect(previewButton).toBeDisabled();

      await panel.getByLabel(/repo/).fill("mcp-context-forge");
      await expect(previewButton).toBeEnabled();

      await previewButton.click();

      await expect.poll(() => requestedUrl).not.toBeNull();
      expect(requestedUrl).toContain(
        `/v1/resources/test/${encodeURI("github://repos/ibm/mcp-context-forge")}`,
      );
      await expect(panel).toContainText("readme contents");
    });
  });

  test.describe("Delete resource", () => {
    test("cancel in confirm dialog keeps resource visible", async ({ page }) => {
      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([RESOURCE_A1]),
        });
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for github-server" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for github-server/i });
      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: "More options for document-txt" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const dialog = page.getByRole("dialog", { name: "Delete resource" });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText(/Are you sure you want to delete "document-txt"/i),
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();

      await expect(dialog).not.toBeVisible();
      await expect(panel.getByText("document-txt").first()).toBeVisible();
    });

    test("optimistically removes resource on delete confirmation and shows success toast", async ({
      page,
    }) => {
      let deleteRequestCount = 0;

      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([RESOURCE_A1, RESOURCE_A2]),
        });
      });
      await page.route(`**/resources/${RESOURCE_A1.id}`, async (route) => {
        if (route.request().method() === "DELETE") {
          deleteRequestCount += 1;
          await route.fulfill({ status: 204 });
        } else {
          await route.fallback();
        }
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for github-server" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for github-server/i });
      await expect(panel).toBeVisible();
      await expect(panel.getByText("document-txt").first()).toBeVisible();

      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: "More options for document-txt" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const dialog = page.getByRole("dialog", { name: "Delete resource" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Delete" }).click();

      await expect.poll(() => deleteRequestCount).toBe(1);
      await expect(
        page.locator("[data-sonner-toast]").filter({ hasText: /document-txt.*deleted/i }),
      ).toBeVisible();
    });

    test("rolls back optimistic delete and shows error toast when delete API fails", async ({
      page,
    }) => {
      let deleteRequestCount = 0;

      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([RESOURCE_A1, RESOURCE_A2]),
        });
      });
      await page.route(`**/resources/${RESOURCE_A1.id}`, async (route) => {
        if (route.request().method() === "DELETE") {
          deleteRequestCount += 1;
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Forbidden" }),
          });
        } else {
          await route.fallback();
        }
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for github-server" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for github-server/i });
      await expect(panel).toBeVisible();

      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: "More options for document-txt" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const dialog = page.getByRole("dialog", { name: "Delete resource" });
      await dialog.getByRole("button", { name: "Delete" }).click();

      await expect.poll(() => deleteRequestCount).toBe(1);

      await expect(
        page.locator("[data-sonner-toast]").filter({ hasText: /Forbidden/i }),
      ).toBeVisible();

      await expect(panel.getByText("document-txt").first()).toBeVisible();
    });

    test("details panel closes immediately when the only resource in a group is deleted", async ({
      page,
    }) => {
      const SOLO = makeResource("solo_resource", "solo-gateway");

      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([SOLO]),
        });
      });
      await page.route(`**/resources/${SOLO.id}`, async (route) => {
        if (route.request().method() === "DELETE") {
          await route.fulfill({ status: 204 });
        } else {
          await route.fallback();
        }
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for solo-gateway" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for solo-gateway/i });
      await expect(panel).toBeVisible();

      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: "More options for solo_resource" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      await page
        .getByRole("dialog", { name: "Delete resource" })
        .getByRole("button", { name: "Delete" })
        .click();

      await expect(panel).not.toBeVisible();
    });

    test("details panel stays open and deleted row is gone while remaining resource stays visible", async ({
      page,
    }) => {
      const RESOURCE_1 = makeResource("alpha_resource", "multi-gw");
      const RESOURCE_2 = makeResource("beta_resource", "multi-gw");

      let resolveDelete!: () => void;
      const deleteHeld = new Promise<void>((res) => {
        resolveDelete = res;
      });

      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([RESOURCE_1, RESOURCE_2]),
        });
      });
      await page.route(`**/resources/${RESOURCE_1.id}`, async (route) => {
        if (route.request().method() === "DELETE") {
          await deleteHeld;
          await route.fulfill({ status: 204 });
        } else {
          await route.fallback();
        }
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for multi-gw" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for multi-gw/i });
      await expect(panel).toBeVisible();
      await expect(panel.getByText("alpha_resource").first()).toBeVisible();
      await expect(panel.getByText("beta_resource").first()).toBeVisible();

      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: "More options for alpha_resource" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page
        .getByRole("dialog", { name: "Delete resource" })
        .getByRole("button", { name: "Delete" })
        .click();

      await expect(panel.getByText("alpha_resource")).not.toBeVisible();
      await expect(panel.getByText("beta_resource").first()).toBeVisible();

      resolveDelete();
      await expect(
        page.locator("[data-sonner-toast]").filter({ hasText: /alpha_resource/i }),
      ).toBeVisible();
    });

    test("card group disappears from grid when its only resource is deleted", async ({ page }) => {
      const SOLO = makeResource("lone_resource", "lone-gateway");
      let resourceDeleted = false;

      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(resourceDeleted ? [RESOURCE_A1] : [SOLO, RESOURCE_A1]),
        });
      });
      await page.route(`**/resources/${SOLO.id}`, async (route) => {
        if (route.request().method() === "DELETE") {
          resourceDeleted = true;
          await route.fulfill({ status: 204 });
        } else {
          await route.fallback();
        }
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await expect(page.getByText("lone-gateway")).toBeVisible();
      await expect(page.getByText("github-server")).toBeVisible();

      await page.getByRole("button", { name: "More options for lone-gateway" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for lone-gateway/i });
      await expect(panel).toBeVisible();

      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: "More options for lone_resource" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page
        .getByRole("dialog", { name: "Delete resource" })
        .getByRole("button", { name: "Delete" })
        .click();

      await expect(page.getByText("lone-gateway")).not.toBeVisible();
      await expect(page.getByText("github-server")).toBeVisible();
    });
  });

  test.describe("Edit resource", () => {
    test("opens edit form pre-filled and updates the resource", async ({ page }) => {
      let putRequestCount = 0;
      let putBody: Record<string, unknown> | undefined;
      let currentResource: Resource = RESOURCE_A1;

      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([currentResource]),
        });
      });
      await page.route(`**/resources/${RESOURCE_A1.id}`, async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ text: "original content" }),
          });
        } else if (route.request().method() === "PUT") {
          putRequestCount += 1;
          putBody = route.request().postDataJSON();
          currentResource = { ...currentResource, name: "renamed-document" };
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(currentResource),
          });
        } else {
          await route.fallback();
        }
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for github-server" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for github-server/i });
      await expect(panel).toBeVisible();

      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: `More options for ${RESOURCE_A1.name}` }).click();
      await page.getByRole("menuitem", { name: "Edit" }).click();

      await expect(page.getByRole("heading", { name: "Edit resource" })).toBeVisible();
      await expect(page.getByLabel(/^Name/)).toHaveValue(RESOURCE_A1.name);
      await expect(page.getByLabel(/^URI/)).toHaveValue(RESOURCE_A1.uri);
      await expect(page.getByLabel(/Content/)).toHaveValue("original content");

      await page.getByLabel(/^Name/).fill("renamed-document");
      await page.getByRole("button", { name: "Update resource" }).click();

      await expect.poll(() => putRequestCount).toBe(1);
      expect(putBody).toMatchObject({ name: "renamed-document" });

      // Editing closes the details panel (like the Tools edit flow) and refetches
      // the list, so the update surfaces as an updated badge in the card grid.
      await expect(page.getByRole("heading", { name: "Edit resource" })).not.toBeVisible();
      await expect(panel).not.toBeVisible();
      await expect(page.getByText("renamed-document").first()).toBeVisible();
    });

    test("shows an inline error and keeps the form open when update fails", async ({ page }) => {
      await page.route("**/resources?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([RESOURCE_A1]),
        });
      });
      await page.route(`**/resources/${RESOURCE_A1.id}`, async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ text: "original content" }),
          });
        } else if (route.request().method() === "PUT") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Update failed" }),
          });
        } else {
          await route.fallback();
        }
      });

      await page.goto(APP.RESOURCES);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "More options for github-server" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();

      const panel = page.getByRole("region", { name: /Resources for github-server/i });
      await panel.getByRole("tab", { name: "Definition" }).click();
      await panel.getByRole("button", { name: `More options for ${RESOURCE_A1.name}` }).click();
      await page.getByRole("menuitem", { name: "Edit" }).click();

      await expect(page.getByLabel(/Content/)).toHaveValue("original content");
      await page.getByRole("button", { name: "Update resource" }).click();

      await expect(page.getByRole("alert").last()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Edit resource" })).toBeVisible();
    });
  });
});
