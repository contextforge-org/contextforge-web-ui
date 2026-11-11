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

const FOUND_CARD = {
  found: true,
  outcome: "found",
  detectedVersion: "1.0",
  card: {
    name: "Visual Router",
    description: "Routes visual-production briefs to vendors.",
    version: "1.1.0",
    supportedInterfaces: [
      { url: "https://agent.example.com/rpc", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
    ],
    skills: [
      { id: "fit", name: "Vendor-fit routing" },
      { id: "hybrid", name: "Hybrid production routing" },
    ],
    securitySchemes: { bearerAuth: { httpAuthSecurityScheme: { scheme: "bearer" } } },
    securityRequirements: [{ schemes: { bearerAuth: {} } }],
  },
  suggestedAgent: {
    name: "Visual Router",
    description: "Routes visual-production briefs to vendors.",
    endpoint_url: "https://agent.example.com/rpc",
    protocol_version: "1.0",
    version: "1.1.0",
    auth_type: "bearer",
  },
  warnings: [],
};

/** Stubs POST <anything>/a2a/fetch-card and records the request bodies. */
async function mockFetchCard(page: Page, result: unknown, status = 200) {
  const bodies: unknown[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/a2a/fetch-card"),
    async (route) => {
      bodies.push(route.request().postDataJSON());
      await json(route, result, status);
    },
  );
  return bodies;
}

/** Stubs POST <anything>/a2a (register) and records the request bodies. */
async function mockRegisterAgent(page: Page, respond: (route: Route) => Promise<void> | void) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route(
    (url) => /\/a2a\/?$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      bodies.push(route.request().postDataJSON());
      return respond(route);
    },
  );
  return bodies;
}

async function startConnect(page: Page, url = "https://agent.example.com") {
  await page.getByRole("button", { name: /Connect agent/ }).click();
  await page.getByPlaceholder("Add URL for a running agent...").fill(url);
  await page.getByRole("button", { name: "Continue" }).click();
}

const CARD_UNAVAILABLE = "Agent card not available: add the details for a running agent manually.";
const CARD_AUTH_REQUIRED =
  "The agent needs credentials to share its card: add the details for the agent manually.";
const CARD_UNREACHABLE =
  "Couldn't reach the agent: check the URL, or add the details for a running agent manually.";
const CARD_ERROR = "Couldn't read the agent card: add the details for a running agent manually.";

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

  test.describe("connect an agent that publishes a card", () => {
    test("reads the card, collects the key and registers the agent", async ({ page }) => {
      let registered = false;
      await mockAgentList(page, () =>
        registered ? [makeAgent("visual-router", { name: "Visual Router" })] : [],
      );
      const fetchBodies = await mockFetchCard(page, FOUND_CARD);
      const createBodies = await mockRegisterAgent(page, async (route) => {
        registered = true;
        await json(route, makeAgent("visual-router", { name: "Visual Router" }), 201);
      });

      await page.goto(APP.AGENTS);
      await startConnect(page);

      // Review: what the card declares
      await expect(page.getByRole("heading", { name: "Visual Router" })).toBeVisible();
      await expect(page.getByText("agent v1.1.0")).toBeVisible();
      await expect(page.getByText("Skills (2)")).toBeVisible();
      await expect(page.getByText("Vendor-fit routing")).toBeVisible();
      await expect(page.getByText("agent.example.com", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();

      // Authenticate and register
      await expect(page.getByRole("heading", { name: "Authenticate agent" })).toBeVisible();
      await page.getByLabel(/Bearer token/i).fill("s3cret");
      await page.getByRole("button", { name: "Connect" }).click();

      await expect(toast(page, /Connected Visual Router/)).toBeVisible();
      await expect(page.getByText("Visual Router", { exact: true })).toBeVisible();
      await expect(page.getByPlaceholder("Add URL for a running agent...")).toBeHidden();

      expect(fetchBodies).toEqual([{ baseUrl: "https://agent.example.com" }]);
      expect(createBodies).toHaveLength(1);
      expect(createBodies[0]).toMatchObject({
        agent: {
          name: "Visual Router",
          endpoint_url: "https://agent.example.com/rpc",
          auth_type: "bearer",
          auth_token: "s3cret",
        },
        visibility: "public",
      });
    });

    test("does not register until the required key is entered", async ({ page }) => {
      await mockAgentList(page, []);
      await mockFetchCard(page, FOUND_CARD);
      const createBodies = await mockRegisterAgent(page, (route) => json(route, {}, 201));

      await page.goto(APP.AGENTS);
      await startConnect(page);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Connect" }).click();

      await expect(page.getByText("Enter the credentials the agent requires.")).toBeVisible();
      expect(createBodies).toHaveLength(0);
    });

    test("shows the server's reason and keeps the form when registration fails", async ({
      page,
    }) => {
      await mockAgentList(page, []);
      await mockFetchCard(page, FOUND_CARD);
      await mockRegisterAgent(page, (route) =>
        json(route, { detail: "Agent name already exists" }, 409),
      );

      await page.goto(APP.AGENTS);
      await startConnect(page);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByLabel(/Bearer token/i).fill("s3cret");
      await page.getByRole("button", { name: "Connect" }).click();

      await expect(page.getByText("Agent name already exists")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Authenticate agent" })).toBeVisible();
    });

    test("goes back from the review to the URL step with the URL kept", async ({ page }) => {
      await mockAgentList(page, []);
      await mockFetchCard(page, FOUND_CARD);

      await page.goto(APP.AGENTS);
      await startConnect(page, "https://agent.example.com");
      await expect(page.getByRole("heading", { name: "Visual Router" })).toBeVisible();
      await page.getByRole("button", { name: "Back" }).click();

      await expect(page.getByPlaceholder("Add URL for a running agent...")).toHaveValue(
        "https://agent.example.com",
      );
    });

    test("returns to the list on Cancel without registering anything", async ({ page }) => {
      await mockAgentList(page, [ALPHA]);
      const createBodies = await mockRegisterAgent(page, (route) => json(route, {}, 201));

      await page.goto(APP.AGENTS);
      await page.getByRole("button", { name: /Connect agent/ }).click();
      await page.getByRole("button", { name: "Cancel" }).click();

      await expect(page.getByText("Agent alpha")).toBeVisible();
      expect(createBodies).toHaveLength(0);
    });

    test("rejects a URL that is not http(s) without calling the gateway", async ({ page }) => {
      await mockAgentList(page, []);
      const fetchBodies = await mockFetchCard(page, FOUND_CARD);

      await page.goto(APP.AGENTS);
      await startConnect(page, "ftp://agent.example.com");

      await expect(page.getByText("Enter a valid http or https URL.")).toBeVisible();
      expect(fetchBodies).toHaveLength(0);
    });

    for (const [name, respond, message] of [
      [
        "publishes no card",
        (route: Route) => json(route, { found: false, outcome: "no_card" }),
        CARD_UNAVAILABLE,
      ],
      [
        "needs credentials to read its card",
        (route: Route) =>
          json(route, { found: false, outcome: "auth_required", authScheme: "Bearer" }),
        CARD_AUTH_REQUIRED,
      ],
      [
        "cannot be reached",
        (route: Route) => json(route, { found: false, outcome: "unreachable" }),
        CARD_UNREACHABLE,
      ],
      [
        "is refused by the gateway",
        (route: Route) => json(route, { detail: "Insufficient permissions" }, 403),
        CARD_ERROR,
      ],
    ] as const) {
      test(`says why and opens manual entry when the agent ${name}`, async ({ page }) => {
        await mockAgentList(page, []);
        await page.route(
          (url) => url.pathname.endsWith("/a2a/fetch-card"),
          (route) => respond(route),
        );

        await page.goto(APP.AGENTS);
        await startConnect(page);

        await expect(page.getByText(message)).toBeVisible();
        await expect(page.getByRole("button", { name: "Enter manually" })).toHaveAttribute(
          "aria-expanded",
          "true",
        );
        await expect(page.getByPlaceholder("Add an agent name")).toBeVisible();
      });
    }
  });

  test.describe("correcting the URL after the card could not be read", () => {
    test("puts manual entry away and reads the card again", async ({ page }) => {
      await mockAgentList(page, []);
      let reads = 0;
      await page.route(
        (url) => url.pathname.endsWith("/a2a/fetch-card"),
        async (route) => {
          reads += 1;
          await (reads === 1
            ? json(route, { found: false, outcome: "no_card" })
            : json(route, FOUND_CARD));
        },
      );

      await page.goto(APP.AGENTS);
      await startConnect(page);
      await expect(page.getByText(CARD_UNAVAILABLE)).toBeVisible();

      await page
        .getByPlaceholder("Add URL for a running agent...")
        .fill("https://agent.example.com/v2");

      await expect(page.getByText(CARD_UNAVAILABLE)).toBeHidden();
      await expect(page.getByRole("button", { name: "Enter manually" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page.getByRole("heading", { name: "Visual Router" })).toBeVisible();
      expect(reads).toBe(2);
    });
  });

  test.describe("enter an agent manually", () => {
    const fillRequired = async (page: Page) => {
      await page.getByPlaceholder("Add an agent name").fill("Echo agent");
      await page.getByPlaceholder("https://agents.example.com/a2a").fill("http://127.0.0.1:9100");
    };

    test("is collapsed until expanded", async ({ page }) => {
      await mockAgentList(page, []);

      await page.goto(APP.AGENTS);
      await page.getByRole("button", { name: /Connect agent/ }).click();

      const toggle = page.getByRole("button", { name: "Enter manually" });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByPlaceholder("Add an agent name")).toBeHidden();

      await toggle.click();

      await expect(page.getByPlaceholder("Add an agent name")).toBeVisible();
      await expect(page.getByRole("radio", { name: "JSON-RPC" })).toBeChecked();
      await expect(page.getByRole("radio", { name: "A2A 1.0" })).toBeChecked();
      await expect(page.getByRole("radio", { name: "None" })).toBeChecked();
    });

    test("registers an agent from the details, with credentials", async ({ page }) => {
      let registered = false;
      await mockAgentList(page, () =>
        registered ? [makeAgent("echo", { name: "Echo agent" })] : [],
      );
      const fetchBodies = await mockFetchCard(page, { found: false, outcome: "no_card" });
      const createBodies = await mockRegisterAgent(page, async (route) => {
        registered = true;
        await json(route, makeAgent("echo", { name: "Echo agent" }), 201);
      });

      await page.goto(APP.AGENTS);
      await startConnect(page, "https://agent.example.com/agent.json");
      await expect(page.getByText(CARD_UNAVAILABLE)).toBeVisible();

      await fillRequired(page);
      await page.getByRole("radio", { name: "A2A 0.3" }).click();
      // The radio is visually hidden; users click its tab label.
      await page.locator('label[for="agent-auth-bearer"]').click();
      await page.getByPlaceholder("Paste bearer token...").fill("s3cret");
      await page.getByPlaceholder("Add a tag").fill("testing, echo");
      await page.getByPlaceholder("Add an optional description...").fill("Echoes text back");
      await page.getByRole("button", { name: "Connect" }).click();

      await expect(toast(page, /Connected Echo agent/)).toBeVisible();
      await expect(page.getByText("Echo agent", { exact: true })).toBeVisible();

      expect(fetchBodies).toHaveLength(1);
      expect(createBodies).toHaveLength(1);
      expect(createBodies[0]).toMatchObject({
        agent: {
          name: "Echo agent",
          endpoint_url: "http://127.0.0.1:9100",
          protocol_version: "0.3",
          auth_type: "bearer",
          auth_token: "s3cret",
          description: "Echoes text back",
          tags: ["testing", "echo"],
        },
        visibility: "public",
      });
    });

    test("registers without reading a card or needing the URL", async ({ page }) => {
      await mockAgentList(page, []);
      const fetchBodies = await mockFetchCard(page, FOUND_CARD);
      const createBodies = await mockRegisterAgent(page, (route) =>
        json(route, makeAgent("echo", { name: "Echo agent" }), 201),
      );

      await page.goto(APP.AGENTS);
      await page.getByRole("button", { name: /Connect agent/ }).click();
      await page.getByRole("button", { name: "Enter manually" }).click();
      await fillRequired(page);
      await page.getByRole("button", { name: "Connect" }).click();

      await expect(toast(page, /Connected Echo agent/)).toBeVisible();
      expect(fetchBodies).toHaveLength(0);
      expect(createBodies).toHaveLength(1);
    });

    test("needs a name and a valid endpoint before registering", async ({ page }) => {
      await mockAgentList(page, []);
      const createBodies = await mockRegisterAgent(page, (route) => json(route, {}, 201));

      await page.goto(APP.AGENTS);
      await page.getByRole("button", { name: /Connect agent/ }).click();
      await page.getByRole("button", { name: "Enter manually" }).click();
      await page.getByPlaceholder("https://agents.example.com/a2a").fill("ftp://nope");
      await page.getByRole("button", { name: "Connect" }).click();

      await expect(page.getByText("Enter a name for the agent.")).toBeVisible();
      await expect(page.getByText("Enter a valid http or https endpoint URL.")).toBeVisible();
      expect(createBodies).toHaveLength(0);
    });

    test("shows the server's reason and keeps the form when registration fails", async ({
      page,
    }) => {
      await mockAgentList(page, []);
      await mockRegisterAgent(page, (route) =>
        json(route, { detail: "Agent name already exists" }, 409),
      );

      await page.goto(APP.AGENTS);
      await page.getByRole("button", { name: /Connect agent/ }).click();
      await page.getByRole("button", { name: "Enter manually" }).click();
      await fillRequired(page);
      await page.getByRole("button", { name: "Connect" }).click();

      await expect(page.getByText("Agent name already exists")).toBeVisible();
      await expect(page.getByPlaceholder("Add an agent name")).toHaveValue("Echo agent");
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

    test("shows an agent's skills with a count, and its tags only when it lists no skills", async ({
      page,
    }) => {
      await mockAgentList(page, [
        makeAgent("skilled", {
          name: "Skilled agent",
          tags: [{ id: "billing", label: "billing" }],
          capabilities: {
            skills: [
              { id: "echo", name: "Echo" },
              { id: "route", name: "Route" },
            ],
          },
        }),
        makeAgent("plain", { name: "Plain agent", tags: [{ id: "ops", label: "ops" }] }),
      ]);

      await page.goto(APP.AGENTS);

      const plainCard = (target: Page) =>
        target.locator('[data-slot="card"]').filter({ hasText: "Plain agent" });
      const skilled = page.locator('[data-slot="card"]').filter({ hasText: "Skilled agent" });
      await expect(skilled.getByText("2 skills")).toBeVisible();
      await expect(skilled.getByText("Echo")).toBeVisible();
      await expect(skilled.getByText("Route")).toBeVisible();
      await expect(page.getByText("billing")).toBeHidden();
      await expect(plainCard(page).getByText("ops", { exact: true })).toBeVisible();

      await expect(plainCard(page).getByText(/skills?$/)).toBeHidden();
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
