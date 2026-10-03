import { test, expect } from "./fixtures/api-mock";
import { APP } from "./utils/paths";

interface RuleFixture {
  id: string;
  name: string;
  description: string;
  capability_type: string;
  capability_id: string | null;
  permission: string | null;
  phase: string;
  predicate: string;
  effect: string;
  priority: number;
  is_active: boolean;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

function makeRule(overrides: Partial<RuleFixture> = {}): RuleFixture {
  return {
    id: "rule-e2e-1",
    name: "deny-viewer-tools",
    description: "",
    capability_type: "tool",
    capability_id: null,
    permission: "tools.read",
    phase: "pre_invocation",
    predicate: "role.viewer",
    effect: "deny",
    priority: 100,
    is_active: true,
    is_system: false,
    created_by: "admin@example.com",
    created_at: "2026-10-03T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

async function mockRulesList(page: import("@playwright/test").Page, rules: RuleFixture[]) {
  await page.route("**/api/rbac/rules*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rules),
      });
      return;
    }
    let body: Record<string, unknown> = {};
    if (route.request().postData()) {
      body = JSON.parse(route.request().postData() ?? "{}");
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...makeRule(), ...body }),
    });
  });
}

async function mockEntitySummary(page: import("@playwright/test").Page) {
  await page.route("**/api/rbac/rules/entity-summary*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rules: [makeRule({ id: "rule-entity", capability_id: "tool-e2e", name: "block-one-tool" })],
        inherited: [
          makeRule({ id: "rule-inherited", capability_id: null, name: "type-wide-rule" }),
        ],
        defaults: { viewer: ["tools.read"] },
      }),
    });
  });
}

test.describe("rules settings tab", () => {
  test("creates a deny rule through the builder and lists it", async ({ page, apiMock }) => {
    await apiMock.mockSession();
    await apiMock.mockPermissions({ permissions: ["*"] });
    await mockRulesList(page, []);

    await page.goto(APP.SETTINGS + "/rules");

    await expect(page.getByRole("tab", { name: "Rules" })).toBeVisible();
    await page.getByRole("button", { name: "Create rule" }).click();
    await page.getByLabel("Name").fill("deny-viewer-tools");
    // The builder default compiles to the authenticated truthiness.
    await expect(page.getByTestId("compiled-predicate")).toHaveText("authenticated");
    await page.getByTestId("submit-rule").click();

    const row = page.getByTestId("rule-row-deny-viewer-tools");
    await expect(row).toBeVisible();
    await expect(page.getByTestId("rule-effect-deny")).toBeVisible();
  });

  test("shows the locked state for system rules", async ({ page, apiMock }) => {
    await apiMock.mockSession();
    await apiMock.mockPermissions({ permissions: ["*"] });
    await mockRulesList(page, [makeRule({ is_system: true, name: "default-viewer-tools-read" })]);

    await page.goto(APP.SETTINGS + "/rules");

    await expect(page.getByTestId("rule-row-default-viewer-tools-read")).toBeVisible();
    await expect(page.getByLabel("System rule")).toBeVisible();
  });

  test("hides the rules tab without the manage permission", async ({ page, apiMock }) => {
    await apiMock.mockSession();
    await apiMock.mockPermissions({ permissions: ["tools.read"] });

    await page.goto(APP.SETTINGS);

    await expect(page.getByRole("tab", { name: "API tokens" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Rules" })).toHaveCount(0);
  });

  test("filters the list by capability type", async ({ page, apiMock }) => {
    await apiMock.mockSession();
    await apiMock.mockPermissions({ permissions: ["*"] });
    await mockRulesList(page, [makeRule()]);

    await page.goto(APP.SETTINGS + "/rules");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Resource" }).click();

    await expect(page).toHaveURL(/capability_type=resource/);
  });
});

test.describe("entity rules tab", () => {
  test("shows entity rules, inherited rules, and the layer note on a tool", async ({
    page,
    apiMock,
  }) => {
    await apiMock.mockSession();
    await apiMock.mockPermissions({ permissions: ["*"] });
    await mockEntitySummary(page);
    await page.route("**/api/tools*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "tool-e2e", name: "web-search", description: "", enabled: true },
        ]),
      });
    });

    await page.goto(APP.TOOLS);
    await page
      .getByRole("button", { name: /web-search/i })
      .first()
      .click();
    await page.getByRole("tab", { name: "Rules" }).click();

    await expect(page.getByTestId("entity-rules-tool")).toBeVisible();
    await expect(page.getByText(/Token scopes/i)).toBeVisible();
    await expect(page.getByTestId("rule-row-block-one-tool")).toBeVisible();
    await expect(page.getByTestId("rule-row-type-wide-rule")).toBeVisible();
  });
});
