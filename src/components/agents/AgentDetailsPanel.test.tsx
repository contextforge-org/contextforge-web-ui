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
import { screen, waitFor } from "@testing-library/react";
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

function useGateway({
  agent = AGENT,
  card = CARD,
  list = bindings(),
}: { agent?: object; card?: object; list?: object } = {}) {
  server.use(
    http.get("/api/v1/a2a/agent-1", () => HttpResponse.json(agent)),
    http.get("/api/v1/a2a/agent-1/card", () => HttpResponse.json(card)),
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

    expect(screen.getByText("Bearer token in Authorization header")).toBeInTheDocument();
    await screen.findByText("Vendor-fit routing");
    expect(container.ownerDocument.body.textContent).not.toContain("super-secret-token");
  });

  it("says when the agent uses no authentication", () => {
    useGateway();
    renderPanel({ agent: { ...AGENT, authType: null } as AgentDetailsFields });

    expect(screen.getByText("No authentication")).toBeInTheDocument();
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

    await waitFor(() => expect(screen.queryByText("pii-filter")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Removed pii-filter");
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

  it("closes from the close button and Escape", async () => {
    useGateway();
    const onClose = vi.fn();
    renderPanel({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Close agent details" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
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
});
