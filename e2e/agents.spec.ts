import { test, expect } from "./fixtures/api-mock";
import { APP } from "./utils/paths";
import type { Page, Route } from "@playwright/test";
import type { A2AAgentRead } from "../src/generated/types";

type Agent = NonNullable<A2AAgentRead>;

function makeAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    name: `Agent ${id}`,
    slug: `agent-${id}`,
    description: `Description for ${id}`,
    endpointUrl: `http://localhost/agents/${id}`,
    agentType: "generic",
    protocolVersion: "1.0",
    capabilities: {},
    config: {},
    enabled: true,
    reachable: true,
    createdAt: "2026-04-28T15:41:31.233166",
    updatedAt: "2026-04-28T15:41:31.233168",
    lastInteraction: null,
    tags: [],
    ...overrides,
  };
}

const ALPHA = makeAgent("alpha");
const BETA = makeAgent("beta", { enabled: false });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Stubs the list call (GET <anything>/a2a). Mutation URLs live below /a2a/ and are not matched. */
async function mockAgentList(page: Page, agents: Agent[] | (() => Agent[]), status = 200) {
  await page.route(
    (url) => /\/a2a\/?$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      if (status !== 200) return json(route, { detail: "Internal server error" }, status);
      return json(route, typeof agents === "function" ? agents() : agents);
    },
  );
}

/** Stubs a mutation on one agent, e.g. POST .../a2a/alpha/state or DELETE .../a2a/alpha. */
async function mockAgentMutation(
  page: Page,
  agentId: string,
  suffix: "state" | "",
  method: "POST" | "DELETE",
  handler: (route: Route) => Promise<void> | void,
) {
  const tail = suffix ? `/a2a/${agentId}/${suffix}` : `/a2a/${agentId}`;
  await page.route(
    (url) => url.pathname.endsWith(tail),
    async (route) => {
      if (route.request().method() !== method) return route.fallback();
      return handler(route);
    },
  );
}

const toast = (page: Page, text: RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });

async function openActions(page: Page, name: string) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
}

test.describe("Agents page", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockSession();
    await apiMock.mockPermissions();
    await page.addInitScript(() => {
      sessionStorage.setItem("mcpgateway_token", "mock-token-12345");
    });
  });

  test.describe("connect agent card", () => {
    test("shows only the Connect agent card when nothing is connected", async ({ page }) => {
      await mockAgentList(page, []);

      await page.goto(APP.AGENTS);

      await expect(page.getByText("Connect agent")).toBeVisible();
      await expect(page.getByText("Connect an agent over the A2A protocol")).toBeVisible();
      await expect(page.getByText("No agents yet")).toBeHidden();
    });

    test("is listed ahead of the connected agents", async ({ page }) => {
      await mockAgentList(page, [ALPHA, BETA]);

      await page.goto(APP.AGENTS);

      await expect(page.getByText("Agent alpha")).toBeVisible();
      await expect(page.getByText("Agent beta")).toBeVisible();
      const cards = page.locator('[data-slot="card"]');
      await expect(cards).toHaveCount(3);
      await expect(cards.first()).toContainText("Connect agent");
    });

    test("is hidden, with the plain empty state shown, without a2a.create", async ({
      page,
      apiMock,
    }) => {
      await apiMock.mockPermissions({ permissions: ["a2a.read"] });
      await mockAgentList(page, []);

      await page.goto(APP.AGENTS);

      await expect(page.getByText("No agents yet")).toBeVisible();
      await expect(page.getByText("Connect agent")).toBeHidden();
    });
  });

  test.describe("list", () => {
    test("renders a card per agent with its status indicator", async ({ page }) => {
      await mockAgentList(page, [ALPHA, BETA]);

      await page.goto(APP.AGENTS);

      await expect(page.getByText("Agent alpha")).toBeVisible();
      await expect(page.getByText("Description for alpha")).toBeVisible();
      await expect(page.getByRole("img", { name: "Active", exact: true })).toHaveCount(1);
      await expect(page.getByRole("img", { name: "Inactive", exact: true })).toHaveCount(1);
    });

    test("requests disabled agents too (include_inactive=true)", async ({ page }) => {
      let requestedUrl = "";
      await page.route(
        (url) => /\/a2a\/?$/.test(url.pathname),
        async (route) => {
          requestedUrl = route.request().url();
          await json(route, [ALPHA]);
        },
      );

      await page.goto(APP.AGENTS);

      await expect(page.getByText("Agent alpha")).toBeVisible();
      expect(new URL(requestedUrl).searchParams.get("include_inactive")).toBe("true");
    });

    test("shows an error state when the API fails", async ({ page }) => {
      await mockAgentList(page, [], 500);

      await page.goto(APP.AGENTS);

      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByText("Error loading agents")).toBeVisible();
    });
  });

  test.describe("enable and disable", () => {
    test("disables an enabled agent", async ({ page }) => {
      let stateUrl = "";
      await mockAgentList(page, [ALPHA]);
      await mockAgentMutation(page, "alpha", "state", "POST", async (route) => {
        stateUrl = route.request().url();
        await json(route, { ...ALPHA, enabled: false });
      });

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");
      await page.getByRole("menuitem", { name: "Disable" }).click();

      await expect(toast(page, /Disabled Agent alpha/)).toBeVisible();
      await expect(page.getByRole("img", { name: "Inactive", exact: true })).toBeVisible();
      expect(new URL(stateUrl).searchParams.get("activate")).toBe("false");
    });

    test("enables a disabled agent", async ({ page }) => {
      let stateUrl = "";
      await mockAgentList(page, [BETA]);
      await mockAgentMutation(page, "beta", "state", "POST", async (route) => {
        stateUrl = route.request().url();
        await json(route, { ...BETA, enabled: true });
      });

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent beta");
      await page.getByRole("menuitem", { name: "Enable" }).click();

      await expect(toast(page, /Enabled Agent beta/)).toBeVisible();
      await expect(page.getByRole("img", { name: "Active", exact: true })).toBeVisible();
      expect(new URL(stateUrl).searchParams.get("activate")).toBe("true");
    });

    test("rolls back and shows an error toast when the request fails", async ({ page }) => {
      await mockAgentList(page, [ALPHA]);
      await mockAgentMutation(page, "alpha", "state", "POST", (route) =>
        json(route, { detail: "Gateway unavailable" }, 500),
      );

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");
      await page.getByRole("menuitem", { name: "Disable" }).click();

      await expect(toast(page, /Gateway unavailable/)).toBeVisible();
      await expect(page.getByRole("img", { name: "Active", exact: true })).toBeVisible();
    });
  });

  test.describe("delete", () => {
    test("asks for confirmation and does not delete until confirmed", async ({ page }) => {
      let deleteCount = 0;
      await mockAgentList(page, [ALPHA]);
      await mockAgentMutation(page, "alpha", "", "DELETE", async (route) => {
        deleteCount += 1;
        await json(route, { status: "success", message: "deleted" });
      });

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Agent alpha");
      expect(deleteCount).toBe(0);
    });

    test("keeps the agent when the confirmation is cancelled", async ({ page }) => {
      let deleteCount = 0;
      await mockAgentList(page, [ALPHA]);
      await mockAgentMutation(page, "alpha", "", "DELETE", async (route) => {
        deleteCount += 1;
        await json(route, {});
      });

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

      await expect(page.getByRole("alertdialog")).toBeHidden();
      await expect(page.getByText("Agent alpha")).toBeVisible();
      expect(deleteCount).toBe(0);
    });

    test("removes the agent and shows a success toast once confirmed", async ({ page }) => {
      let deleteCount = 0;
      await mockAgentList(page, [ALPHA, BETA]);
      await mockAgentMutation(page, "alpha", "", "DELETE", async (route) => {
        deleteCount += 1;
        await json(route, { status: "success", message: "deleted" });
      });

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

      await expect(toast(page, /Deleted Agent alpha/)).toBeVisible();
      await expect(page.getByText("Agent alpha")).toBeHidden();
      await expect(page.getByText("Agent beta")).toBeVisible();
      expect(deleteCount).toBe(1);
    });

    test("keeps the agent and shows an error toast when the delete fails", async ({ page }) => {
      await mockAgentList(page, [ALPHA]);
      await mockAgentMutation(page, "alpha", "", "DELETE", (route) =>
        json(route, { detail: "Agent is in use" }, 409),
      );

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

      await expect(toast(page, /Agent is in use/)).toBeVisible();
      await expect(page.getByText("Agent alpha")).toBeVisible();
    });
  });

  test.describe("permissions", () => {
    test("offers only Enable/Disable with a2a.update alone", async ({ page, apiMock }) => {
      await apiMock.mockPermissions({ permissions: ["a2a.read", "a2a.update"] });
      await mockAgentList(page, [ALPHA]);

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");

      await expect(page.getByRole("menuitem", { name: "Disable" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Delete" })).toBeHidden();
    });

    test("offers only Delete with a2a.delete alone", async ({ page, apiMock }) => {
      await apiMock.mockPermissions({ permissions: ["a2a.read", "a2a.delete"] });
      await mockAgentList(page, [ALPHA]);

      await page.goto(APP.AGENTS);
      await openActions(page, "Agent alpha");

      await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Disable" })).toBeHidden();
    });

    test("shows no actions menu without update or delete permission", async ({ page, apiMock }) => {
      await apiMock.mockPermissions({ permissions: ["a2a.read"] });
      await mockAgentList(page, [ALPHA]);

      await page.goto(APP.AGENTS);

      await expect(page.getByText("Agent alpha")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
    });
  });
});
