import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockHasPermission = vi.fn((_perm: string) => true);

vi.mock("@/auth/AuthContext", () => ({
  useAuthContext: () => ({
    user: { email: "test@example.com", is_admin: true, is_active: true },
    isAuthenticated: true,
    isLoading: false,
    selectedTeamId: null,
    login: vi.fn(),
    logout: vi.fn(),
    setSelectedTeamId: vi.fn(),
    hasPermission: mockHasPermission,
    permissionsLoading: false,
  }),
}));

import { toast } from "sonner";
import userEvent from "@testing-library/user-event";
import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithProviders } from "@/test/test-utils";
import type { A2AAgentRead } from "@/generated/types";
import { AgentDetailsPanel, type AgentDetailsFields } from "./AgentDetailsPanel";

const AGENT: NonNullable<A2AAgentRead> = {
  id: "agent-1",
  name: "objekts router",
  description: "Routes visual production briefs.",
  endpointUrl: "https://objekts.example.com/a2a/v1",
  agentType: "jsonrpc",
  protocolVersion: "1.0",
  capabilities: { streaming: true, extensions: [] },
  config: {},
  enabled: true,
  reachable: true,
  createdAt: "2026-11-04T14:32:08.123Z",
  updatedAt: "2026-11-10T11:03:13Z",
  lastInteraction: null,
  tags: [{ label: "development" }, { label: "alerts" }],
  authType: "bearer",
  // Credential material the panel must never show.
  authToken: "super-secret-token", // pragma: allowlist secret
  visibility: "public",
  team: "Platform",
  teamId: "team-1",
  ownerEmail: "admin@example.com",
};

const CARD = {
  name: "objekts router",
  defaultInputModes: ["text", "application/pdf"],
  defaultOutputModes: ["text", "application/json"],
  capabilities: { streaming: true, extensions: [{ uri: "x" }] },
  skills: [{ name: "Vendor-fit routing" }, { name: "Tender support" }],
};

function bindings(...items: Array<{ id: string; agentName: string; pluginId: string }>) {
  return {
    total: items.length,
    bindings: items.map((item) => ({
      teamId: "team-1",
      mode: "enforce",
      priority: 10,
      config: {},
      createdAt: "2026-11-04T14:32:08Z",
      createdBy: "a@example.com",
      updatedAt: "2026-11-04T14:32:08Z",
      updatedBy: "a@example.com",
      ...item,
    })),
  };
}

// The card the agent published, as the gateway stored it when the agent was registered.
const STORED = {
  version: 1,
  detectedVersion: "1.0",
  sourceUrl: "https://objekts.example.com/.well-known/agent-card.json",
  fetchedAt: "2026-11-10T11:03:13Z",
  card: {
    name: "objekts router",
    version: "3.4.1",
    provider: { organization: "Objekts", url: "https://objekts.example.com" },
    documentationUrl: "https://docs.example.com/objekts",
    supportedInterfaces: [
      { url: "https://objekts.example.com/a2a/v1", protocolBinding: "JSONRPC" },
      { url: "https://objekts.example.com/a2a/http", protocolBinding: "HTTP+JSON" },
    ],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["application/json"],
    capabilities: { streaming: false, pushNotifications: true, extensions: [{ uri: "x" }] },
    skills: [{ name: "Stored skill" }],
  },
};

function useGateway({
  agent = AGENT,
  card = CARD,
  list = bindings(),
  stored = null,
  onCard,
}: {
  agent?: object;
  card?: object;
  list?: object;
  /** What `stored-card` returns; `null` means the agent has no stored card (404). */
  stored?: object | null;
  onCard?: () => void;
} = {}) {
  server.use(
    http.get("/api/v1/a2a/agent-1", () => HttpResponse.json(agent)),
    http.get("/api/v1/a2a/agent-1/stored-card", () =>
      stored
        ? HttpResponse.json(stored)
        : HttpResponse.json({ detail: "No stored Agent Card for this agent" }, { status: 404 }),
    ),
    http.get("/api/v1/a2a/agent-1/card", () => {
      onCard?.();
      return HttpResponse.json(card);
    }),
    http.get("/api/v1/a2a-agents/plugin-bindings/team-1", () => HttpResponse.json(list)),
  );
}

function renderPanel(props: Partial<React.ComponentProps<typeof AgentDetailsPanel>> = {}) {
  return renderWithProviders(
    <AgentDetailsPanel
      agent={AGENT as AgentDetailsFields}
      open
      onClose={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  );
}

describe("AgentDetailsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation(() => true);
    // Without Try it the panel shows the definition straight away; the tests below that
    // read the definition rely on that. The Try it tests turn A2A on.
    server.use(
      http.get("/api/v1/auth/email/me", () => HttpResponse.json({ features: { a2a: false } })),
    );
  });

  it("shows the configuration in the sidebar", async () => {
    useGateway();
    renderPanel();

    expect(screen.getByRole("heading", { name: "objekts router" })).toBeInTheDocument();
    expect(screen.getByText("Routes visual production briefs.")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Internal")).toBeInTheDocument();
    expect(screen.getByText("A2A v1.0")).toBeInTheDocument();
    expect(screen.getByText("JSON-RPC")).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("development")).toBeInTheDocument();
    expect(screen.getByText("alerts")).toBeInTheDocument();
    expect(screen.getByText("2026-11-04T14:32:08")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("shows skills, capabilities and modes from the agent's card", async () => {
    useGateway();
    renderPanel();

    expect(await screen.findByText("Vendor-fit routing")).toBeInTheDocument();
    expect(screen.getByText("Tender support")).toBeInTheDocument();
    expect(screen.getByText("Streaming")).toBeInTheDocument();
    expect(screen.getByText("Extensions")).toBeInTheDocument();
    expect(screen.getByText("text, application/pdf")).toBeInTheDocument();
    expect(screen.getByText("text, application/json")).toBeInTheDocument();
  });

  it("still renders when the card cannot be read", async () => {
    useGateway();
    server.use(
      http.get("/api/v1/a2a/agent-1/card", () =>
        HttpResponse.json({ detail: "no" }, { status: 500 }),
      ),
    );
    renderPanel();

    await waitFor(() => expect(screen.getByText("Streaming")).toBeInTheDocument());
    expect(screen.queryByText("Modes")).not.toBeInTheDocument();
  });

  it("names the authentication type and never shows a credential", async () => {
    useGateway();
    const { container } = renderPanel();

    expect(await screen.findByText("Bearer token in Authorization header")).toBeInTheDocument();
    await screen.findByText("Vendor-fit routing");
    expect(container.ownerDocument.body.textContent).not.toContain("super-secret-token");
  });

  it("says when the agent uses no authentication", async () => {
    const agent = { ...AGENT, authType: null } as AgentDetailsFields;
    useGateway({ agent });
    renderPanel({ agent });

    expect(await screen.findByText("No authentication")).toBeInTheDocument();
  });

  it("reports an authentication type it does not know instead of calling it none", async () => {
    const agent = { ...AGENT, authType: "mtls" } as AgentDetailsFields;
    useGateway({ agent });
    renderPanel({ agent });

    expect(await screen.findByText("unknown")).toBeInTheDocument();
    expect(screen.queryByText("No authentication")).not.toBeInTheDocument();
  });

  it("flags an enabled agent that cannot be reached", () => {
    useGateway();
    renderPanel({ agent: { ...AGENT, reachable: false } as AgentDetailsFields });

    expect(screen.getByText("Enabled, unreachable")).toBeInTheDocument();
  });

  it("shows the plugins bound to this agent and team-wide ones, not another agent's", async () => {
    useGateway({
      list: bindings(
        { id: "b1", agentName: "objekts router", pluginId: "pii-filter" },
        { id: "b2", agentName: "*", pluginId: "rate-limit" },
        { id: "b3", agentName: "other agent", pluginId: "secret-scanner" },
      ),
    });
    renderPanel();

    expect(await screen.findByText("pii-filter")).toBeInTheDocument();
    expect(screen.getByText("rate-limit")).toBeInTheDocument();
    expect(screen.getByText("team-wide")).toBeInTheDocument();
    expect(screen.queryByText("secret-scanner")).not.toBeInTheDocument();
  });

  it("removes a binding", async () => {
    useGateway({
      list: bindings({ id: "b1", agentName: "objekts router", pluginId: "pii-filter" }),
    });
    server.use(
      http.delete("/api/v1/a2a-agents/plugin-bindings/b1", () => HttpResponse.json({ id: "b1" })),
    );
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Remove pii-filter" }));
    expect(
      await screen.findByText("pii-filter will no longer apply to objekts router."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByText("pii-filter")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Removed pii-filter");
  });

  it("asks before removing, and removes nothing when cancelled", async () => {
    let deletes = 0;
    useGateway({
      list: bindings({ id: "b1", agentName: "objekts router", pluginId: "pii-filter" }),
    });
    server.use(
      http.delete("/api/v1/a2a-agents/plugin-bindings/b1", () => {
        deletes += 1;
        return HttpResponse.json({ id: "b1" });
      }),
    );
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Remove pii-filter" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(deletes).toBe(0);
    expect(screen.getByText("pii-filter")).toBeInTheDocument();
  });

  it("says a team-wide binding applies to every agent in the team", async () => {
    useGateway({ list: bindings({ id: "b2", agentName: "*", pluginId: "rate-limit" }) });
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Remove rate-limit" }));

    expect(await screen.findByText(/applies to every agent in this team/)).toBeVisible();
  });

  it("keeps the binding and reports a failed removal", async () => {
    useGateway({
      list: bindings({ id: "b1", agentName: "objekts router", pluginId: "pii-filter" }),
    });
    server.use(
      http.delete("/api/v1/a2a-agents/plugin-bindings/b1", () =>
        HttpResponse.json({ detail: "Not allowed" }, { status: 403 }),
      ),
    );
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Remove pii-filter" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText("pii-filter")).toBeInTheDocument();
  });

  it("hides the remove action without the manage permission", async () => {
    mockHasPermission.mockImplementation((perm) => perm !== "tools.manage_plugins");
    useGateway({
      list: bindings({ id: "b1", agentName: "objekts router", pluginId: "pii-filter" }),
    });
    renderPanel();

    expect(await screen.findByText("pii-filter")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove pii-filter" })).not.toBeInTheDocument();
  });

  it("hides the plugins without the read permission", async () => {
    mockHasPermission.mockImplementation((perm) => perm !== "tools.read");
    useGateway({
      list: bindings({ id: "b1", agentName: "objekts router", pluginId: "pii-filter" }),
    });
    renderPanel();

    await screen.findByText("Vendor-fit routing");
    expect(screen.queryByText("pii-filter")).not.toBeInTheDocument();
    expect(screen.queryByText("Plugins")).not.toBeInTheDocument();
  });

  describe("Try it tab", () => {
    beforeEach(() => {
      server.use(
        http.get("/api/v1/auth/email/me", () => HttpResponse.json({ features: { a2a: true } })),
      );
    });

    it("is offered to a caller with a2a.invoke when A2A is on, and is the tab shown first", async () => {
      useGateway();
      renderPanel();

      const tryIt = await screen.findByRole("tab", { name: "Try it" });
      expect(tryIt).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Definition" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByRole("button", { name: "Send test message" })).toBeInTheDocument();
      expect(screen.queryByText("Vendor-fit routing")).not.toBeInTheDocument();
    });

    it("shows the definition from the other tab", async () => {
      useGateway();
      renderPanel();

      await userEvent.setup().click(await screen.findByRole("tab", { name: "Definition" }));
      expect(await screen.findByText("Vendor-fit routing")).toBeInTheDocument();
    });

    it("opens on Try it again for the next agent", async () => {
      useGateway();
      const { rerender } = renderPanel();
      const user = userEvent.setup();
      await user.click(await screen.findByRole("tab", { name: "Definition" }));
      expect(screen.getByRole("tab", { name: "Definition" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      rerender(
        <AgentDetailsPanel
          agent={{ ...AGENT, id: "agent-2" } as AgentDetailsFields}
          open
          onClose={vi.fn()}
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole("tab", { name: "Try it" })).toHaveAttribute(
          "aria-selected",
          "true",
        ),
      );
    });

    it("holds back the tabs until it knows whether Try it is offered", async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get("/api/v1/auth/email/me", async () => {
          await gate;
          return HttpResponse.json({ features: { a2a: true } });
        }),
      );
      useGateway();
      renderPanel();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByText("Vendor-fit routing")).not.toBeInTheDocument();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();

      release();
      expect(await screen.findByRole("tab", { name: "Try it" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("falls back to Definition when the feature check fails", async () => {
      server.use(http.get("/api/v1/auth/email/me", () => HttpResponse.error()));
      useGateway();
      renderPanel();

      expect(await screen.findByText("Vendor-fit routing")).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Try it" })).not.toBeInTheDocument();
    });

    it("falls back to Definition when the feature check hangs until the request times out", async () => {
      server.use(http.get("/api/v1/auth/email/me", () => new Promise<never>(() => {})));
      useGateway();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderPanel();
        expect(screen.queryByText("Vendor-fit routing")).not.toBeInTheDocument();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });

        expect(await screen.findByText("Vendor-fit routing")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Try it" })).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("hides the kept-mounted Try it panel while Definition is selected", async () => {
      useGateway();
      renderPanel();
      const user = userEvent.setup();
      const field = await screen.findByLabelText("Test agent");
      const panel = field.closest('[role="tabpanel"]');
      expect(panel).toHaveAttribute("data-state", "active");

      await user.click(screen.getByRole("tab", { name: "Definition" }));
      await screen.findByText("Vendor-fit routing");

      // Still mounted to keep its state, but hidden and out of the tab order.
      expect(panel).toHaveAttribute("data-state", "inactive");
      expect(panel).toHaveClass("data-[state=inactive]:hidden");
    });

    it("keeps the message while looking at Definition", async () => {
      useGateway();
      renderPanel();
      const user = userEvent.setup();
      await user.type(await screen.findByLabelText("Test agent"), "keep me");

      await user.click(screen.getByRole("tab", { name: "Definition" }));
      await screen.findByText("Vendor-fit routing");
      await user.click(screen.getByRole("tab", { name: "Try it" }));

      expect(screen.getByLabelText("Test agent")).toHaveValue("keep me");
    });

    it("drops the message when the drawer closes, so a reopen starts clean", async () => {
      useGateway();
      const { rerender } = renderPanel();
      await userEvent.setup().type(await screen.findByLabelText("Test agent"), "stale");

      const closed = (open: boolean) => (
        <AgentDetailsPanel agent={AGENT as AgentDetailsFields} open={open} onClose={vi.fn()} />
      );
      rerender(closed(false));
      expect(screen.queryByLabelText("Test agent")).not.toBeInTheDocument();

      rerender(closed(true));
      expect(await screen.findByLabelText("Test agent")).toHaveValue("");
    });

    it("is hidden without a2a.invoke", async () => {
      mockHasPermission.mockImplementation((perm) => perm !== "a2a.invoke");
      useGateway();
      renderPanel();

      await screen.findByText("Vendor-fit routing");
      expect(screen.queryByRole("tab", { name: "Try it" })).not.toBeInTheDocument();
    });

    it("is hidden when A2A is off", async () => {
      server.use(
        http.get("/api/v1/auth/email/me", () => HttpResponse.json({ features: { a2a: false } })),
      );
      useGateway();
      renderPanel();

      await screen.findByText("Vendor-fit routing");
      expect(screen.queryByRole("tab", { name: "Try it" })).not.toBeInTheDocument();
    });
  });

  it("offers only the actions the caller may take", async () => {
    useGateway();
    renderPanel({ onToggle: undefined });

    await userEvent.click(screen.getByRole("button", { name: "Actions for objekts router" }));
    expect(screen.queryByRole("menuitem", { name: "Disable" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("has no action menu when the caller may take none", () => {
    useGateway();
    renderPanel({ onToggle: undefined, onDelete: undefined });

    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it("calls the toggle and delete handlers with the agent", async () => {
    useGateway();
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    renderPanel({ onToggle, onDelete });

    await userEvent.click(screen.getByRole("button", { name: "Actions for objekts router" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Disable" }));
    expect(onToggle).toHaveBeenCalledWith("agent-1", true);

    await userEvent.click(screen.getByRole("button", { name: "Actions for objekts router" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("agent-1");
  });

  it("lists Edit directly above Delete and calls the edit handler with the agent", async () => {
    useGateway();
    const onEdit = vi.fn();
    renderPanel({ onEdit });

    await userEvent.click(screen.getByRole("button", { name: "Actions for objekts router" }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items.indexOf("Edit")).toBe(items.indexOf("Delete") - 1);

    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith("agent-1");
  });

  it("hides Edit when the caller may not edit", async () => {
    useGateway();
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Actions for objekts router" }));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("closes from the close button and Escape", async () => {
    useGateway();
    const onClose = vi.fn();
    renderPanel({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Close agent details" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close when Escape only dismisses the tag editor", async () => {
    useGateway();
    const onClose = vi.fn();
    renderPanel({ onClose, onAddTag: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: "Add tags" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "Add tags" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the agent's own skills and modes when the card isn't served", async () => {
    // A disabled agent has no card: the gateway answers 404.
    useGateway({
      agent: {
        ...AGENT,
        enabled: false,
        skills: [{ name: "Tender support" }],
        capabilities: { defaultInputModes: ["text"], defaultOutputModes: ["application/json"] },
      },
    });
    server.use(http.get("/api/v1/a2a/agent-1/card", () => new HttpResponse(null, { status: 404 })));
    renderPanel({
      agent: {
        ...AGENT,
        enabled: false,
        skills: [{ name: "Tender support" }],
        capabilities: { defaultInputModes: ["text"], defaultOutputModes: ["application/json"] },
      } as AgentDetailsFields,
    });

    expect(await screen.findByText("Tender support")).toBeInTheDocument();
    expect(screen.getByText("application/json")).toBeInTheDocument();
  });

  it("reports a failed read but keeps showing the list entry", async () => {
    useGateway();
    server.use(
      http.get("/api/v1/a2a/agent-1", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );
    renderPanel();

    expect(await screen.findByText("Couldn't load the agent details.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "objekts router" })).toBeInTheDocument();
  });

  it("follows the list entry's enabled state after a toggle", async () => {
    useGateway();
    const view = renderPanel();
    await screen.findByText("Vendor-fit routing");
    expect(screen.getByText("Enabled")).toBeInTheDocument();

    view.rerender(
      <AgentDetailsPanel
        agent={{ ...AGENT, enabled: false } as AgentDetailsFields}
        open
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("shows the stored agent type, not a protocol binding, for generic and other types", () => {
    useGateway();
    const view = renderPanel({ agent: { ...AGENT, agentType: "generic" } as AgentDetailsFields });
    expect(screen.getByText("generic")).toBeInTheDocument();

    view.rerender(
      <AgentDetailsPanel
        agent={{ ...AGENT, agentType: "openai" } as AgentDetailsFields}
        open
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("openai")).toBeInTheDocument();
  });

  describe("adding a tag", () => {
    it("saves the full tag list and calls back with it", async () => {
      useGateway();
      const onAddTag = vi.fn().mockResolvedValue(undefined);
      renderPanel({ onAddTag });

      await userEvent.click(screen.getByRole("button", { name: "Add tags" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Add tags" }), "new, alerts{Enter}");

      // "alerts" is already on the agent, so only "new" is added.
      await waitFor(() =>
        expect(onAddTag).toHaveBeenCalledWith("agent-1", ["development", "alerts", "new"]),
      );
    });

    it("shows the tags without an add option when the caller may not update", () => {
      useGateway();
      renderPanel({ onAddTag: undefined });

      expect(screen.getByText("development")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add tags" })).toBeDisabled();
    });
  });

  describe("stored agent card", () => {
    it("shows where the card came from and what it says, above the skills", async () => {
      useGateway({ stored: STORED });
      renderPanel();

      expect(await screen.findByText("Stored skill")).toBeInTheDocument();
      expect(screen.getByText("3.4.1")).toBeInTheDocument();
      expect(screen.getByText("Objekts · objekts.example.com")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "https://docs.example.com/objekts" }),
      ).toHaveAttribute("href", "https://docs.example.com/objekts");
      expect(screen.getByText("JSON-RPC, HTTP+JSON")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Source/ })).toBeInTheDocument();

      const source = screen.getByText("Source");
      const skills = screen.getByText("Skills");
      expect(
        source.compareDocumentPosition(skills) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("reads skills, capabilities and modes from the stored card and does not ask for the built one", async () => {
      let builtCardRequests = 0;
      useGateway({ stored: STORED, onCard: () => (builtCardRequests += 1) });
      renderPanel();

      expect(await screen.findByText("Stored skill")).toBeInTheDocument();
      expect(screen.queryByText("Vendor-fit routing")).not.toBeInTheDocument();
      expect(screen.getByText("text/plain")).toBeInTheDocument();
      expect(screen.getByText("application/json")).toBeInTheDocument();
      expect(builtCardRequests).toBe(0);
    });

    it("falls back to the card ContextForge builds when no card is stored", async () => {
      useGateway({ stored: null });
      renderPanel();

      expect(await screen.findByText("Vendor-fit routing")).toBeInTheDocument();
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
      expect(screen.queryByText("Protocol binding")).not.toBeInTheDocument();
    });

    it("falls back the same way when the stored card cannot be read", async () => {
      useGateway();
      server.use(
        http.get("/api/v1/a2a/agent-1/stored-card", () =>
          HttpResponse.json({ detail: "boom" }, { status: 500 }),
        ),
      );
      renderPanel();

      expect(await screen.findByText("Vendor-fit routing")).toBeInTheDocument();
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
    });

    it("treats a stored-card reply with no card in it as none", async () => {
      useGateway({ stored: { version: 1, sourceUrl: "https://x.example/card.json" } });
      renderPanel();

      expect(await screen.findByText("Vendor-fit routing")).toBeInTheDocument();
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
    });

    it("says what the card leaves out", async () => {
      useGateway({
        stored: { ...STORED, card: { name: "objekts router", skills: [{ name: "Only skill" }] } },
      });
      renderPanel();

      expect(await screen.findByText("Only skill")).toBeInTheDocument();
      // Version, provider, documentation and protocol binding.
      expect(screen.getAllByText("Not stated")).toHaveLength(4);
    });

    it("only links documentation that is http or https", async () => {
      useGateway({
        stored: { ...STORED, card: { ...STORED.card, documentationUrl: "javascript:alert(1)" } },
      });
      renderPanel();

      expect(await screen.findByText("javascript:alert(1)")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /javascript/ })).not.toBeInTheDocument();
    });

    it("does not show the agent's credentials or the card's signatures", async () => {
      useGateway({
        stored: {
          ...STORED,
          card: { ...STORED.card, signatures: [{ protected: "abc", signature: "sig-value" }] },
        },
      });
      renderPanel();
      await screen.findByText("Stored skill");

      const text = document.body.textContent ?? "";
      expect(text).not.toContain("super-secret-token");
      expect(text).not.toContain("sig-value");
    });

    it("does not break on a card whose fields have the wrong type", async () => {
      useGateway({
        stored: {
          ...STORED,
          card: {
            name: "objekts router",
            version: 3,
            documentationUrl: { href: "x" },
            supportedInterfaces: [{ protocolBinding: 7 }, null],
            skills: [{ name: "Odd skill" }],
          },
        },
      });
      renderPanel();

      expect(await screen.findByText("Odd skill")).toBeInTheDocument();
      expect(screen.getAllByText("Not stated").length).toBeGreaterThan(0);
    });
  });

  it("renders nothing for a selected agent that is not there", () => {
    useGateway();
    renderPanel({ agent: null });

    expect(screen.queryByText("Agent details")).not.toBeInTheDocument();
  });
});
