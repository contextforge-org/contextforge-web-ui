import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server as mswServer } from "@/test/mocks/server";
import { renderWithProviders as render } from "@/test/test-utils";
import { VirtualServerDetailsPanel } from "./VirtualServerDetailsPanel";
import type { VirtualServer } from "@/types/server";
import type { Tool } from "@/types/tool";
import { copyToClipboard } from "@/lib/clipboard";

vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn() }));

const authMock = vi.hoisted(() => ({
  permissions: ["*"] as string[],
  permissionsLoading: false,
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      authMock.permissions.includes("*") || authMock.permissions.includes(permission),
    permissionsLoading: authMock.permissionsLoading,
  }),
}));

function makeServer(overrides: Partial<VirtualServer> = {}): VirtualServer {
  return {
    id: "gateway-1",
    name: "GH repo tasks",
    description: "Test server",
    icon: "",
    createdAt: "2026-04-16T13:23:12Z",
    updatedAt: "2026-04-16T13:23:12Z",
    enabled: true,
    associatedTools: [],
    associatedToolIds: [],
    associatedResources: [],
    associatedPrompts: [],
    associatedA2aAgents: [],
    metrics: null,
    tags: [],
    createdBy: "admin@example.com",
    createdFromIp: "127.0.0.1",
    createdVia: "ui",
    createdUserAgent: "Mozilla/5.0",
    modifiedBy: null,
    modifiedFromIp: null,
    modifiedVia: null,
    modifiedUserAgent: null,
    importBatchId: null,
    federationSource: null,
    version: 1,
    teamId: "team-1",
    team: "Test Team",
    ownerEmail: "admin@example.com",
    visibility: "team",
    oauthEnabled: false,
    oauthConfig: null,
    ...overrides,
  };
}

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: "tool-search",
    name: "github.search_issues",
    originalName: "search_issues",
    description: "Search repository issues",
    originalDescription: "Search repository issues",
    title: "Search issues",
    displayName: "Search issues",
    gatewayId: "gateway-id",
    gatewaySlug: "github-server",
    customName: "",
    customNameSlug: "search_issues",
    enabled: true,
    reachable: true,
    deprecated: false,
    executionCount: 0,
    tags: [],
    integrationType: "MCP",
    requestType: "http",
    url: "https://example.com/mcp",
    headers: {},
    annotations: { readOnlyHint: true },
    jsonpathFilter: null,
    auth: null,
    version: 1,
    visibility: "team",
    createdAt: "2024-01-01T00:00:00",
    updatedAt: "2024-01-02T00:00:00",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
    ...overrides,
  };
}

beforeEach(() => {
  authMock.permissions = ["*"];
  authMock.permissionsLoading = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("VirtualServerDetailsPanel inline tag add", () => {
  it("calls onAddTag with the merged, de-duplicated tag list", async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn().mockResolvedValue(undefined);

    render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "gw-1", tags: ["prod"] })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
        onAddTag={onAddTag}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add tags" }));
    await user.type(screen.getByPlaceholderText("Add tags separated with commas"), "staging, prod");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // "prod" already exists and is dropped; "staging" is appended.
    expect(onAddTag).toHaveBeenCalledWith("gw-1", ["prod", "staging"]);
  });

  it("disables the add-tag trigger when onAddTag is omitted", () => {
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ tags: [] })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Add tags" })).toBeDisabled();
  });
});

describe("VirtualServerDetailsPanel components list", () => {
  beforeEach(() => {
    // The panel fetches tools/resources/prompts when open; return empty so it
    // falls back to the server's associated* arrays for rendering.
    mswServer.use(
      http.get("*/servers/:id/tools", () => HttpResponse.json({ tools: [] })),
      http.get("*/servers/:id/resources", () => HttpResponse.json({ resources: [] })),
      http.get("*/servers/:id/prompts", () => HttpResponse.json({ prompts: [] })),
    );
    vi.mocked(copyToClipboard).mockClear();
  });

  function renderWithComponents() {
    return render(
      <VirtualServerDetailsPanel
        server={makeServer({
          id: "gw-components",
          // index 0: id differs from name -> gets a title; index 1: id equals name -> no title.
          associatedTools: ["Titled Tool", "Plain Tool"],
          associatedToolIds: ["titled-tool-id", "Plain Tool"],
          associatedResources: ["res://example/thing"],
          associatedPrompts: ["greeting-prompt"],
        })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
  }

  it("renders titled and untitled component rows with badges", async () => {
    renderWithComponents();

    // Titled tool row shows the display title and the id as the identifier.
    expect(await screen.findByText("Titled Tool")).toBeInTheDocument();
    expect(screen.getByText("titled-tool-id")).toBeInTheDocument();
    // Untitled rows render the identifier directly.
    expect(screen.getByText("Plain Tool")).toBeInTheDocument();
    expect(screen.getByText("res://example/thing")).toBeInTheDocument();
    expect(screen.getByText("greeting-prompt")).toBeInTheDocument();

    // Type badges for each component kind.
    expect(screen.getAllByText("tool")).toHaveLength(2);
    expect(screen.getByText("resource")).toBeInTheDocument();
    expect(screen.getByText("prompt")).toBeInTheDocument();
  });

  it("copies the identifier when a row's copy button is clicked", async () => {
    const user = userEvent.setup();
    renderWithComponents();

    await screen.findByText("Titled Tool");

    await user.click(screen.getByRole("button", { name: "Copy tool name for Titled Tool" }));
    expect(copyToClipboard).toHaveBeenCalledWith("titled-tool-id");

    // The untitled row has no separate name to reference, so its copy label
    // uses the component-type noun rather than the raw identifier value.
    await user.click(screen.getByRole("button", { name: "Copy tool" }));
    expect(copyToClipboard).toHaveBeenCalledWith("Plain Tool");
  });

  it("filters visible components with the search box", async () => {
    const user = userEvent.setup();
    renderWithComponents();

    await screen.findByText("Titled Tool");

    // Focus via the search affordance, then type a query.
    await user.click(screen.getByRole("button", { name: "Search components" }));
    const searchBox = screen.getByRole("searchbox");
    await user.type(searchBox, "Titled");

    await waitFor(() => {
      expect(screen.queryByText("Plain Tool")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Titled Tool")).toBeInTheDocument();

    // Blur keeps the box expanded while a query is present.
    await user.tab();
    expect(searchBox).toHaveValue("Titled");
  });

  it("renders source tabs and filters components by source", async () => {
    const user = userEvent.setup();
    // Fetched components carry a gateway_id, which drives the source tabs.
    mswServer.use(
      http.get("*/servers/:id/tools", () =>
        HttpResponse.json({
          tools: [
            { id: "t1", name: "Tool One", originalName: "tool_one", gateway_id: "gwA" },
            { id: "t2", name: "Tool Two", originalName: "tool_two", gateway_id: "gwB" },
          ],
        }),
      ),
      http.get("*/gateways", () =>
        HttpResponse.json({
          gateways: [
            { id: "gwA", name: "Gateway A" },
            { id: "gwB", name: "Gateway B" },
          ],
        }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "gw-sources" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    // Source tabs resolve from the gateways response.
    expect(await screen.findByRole("tab", { name: "Gateway A" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Gateway B" })).toBeInTheDocument();
    expect(screen.getByText("tool_one")).toBeInTheDocument();
    expect(screen.getByText("tool_two")).toBeInTheDocument();

    // Selecting a source filters the component list to that gateway.
    await user.click(screen.getByRole("tab", { name: "Gateway A" }));
    await waitFor(() => {
      expect(screen.queryByText("tool_two")).not.toBeInTheDocument();
    });
    expect(screen.getByText("tool_one")).toBeInTheDocument();

    // Arrow keys move focus across the source tablist.
    const allSources = screen.getByRole("tab", { name: "All sources" });
    allSources.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Gateway A" })).toHaveFocus();
  });

  it("moves the active tab with arrow keys", async () => {
    const user = userEvent.setup();
    renderWithComponents();

    await screen.findByText("Titled Tool");

    const allTab = screen.getByRole("tab", { name: "All" });
    expect(allTab).toHaveAttribute("aria-selected", "true");

    allTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Tools" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");

    // ArrowLeft from the first tab wraps around to the last.
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Prompts" })).toHaveAttribute("aria-selected", "true");

    // Clicking a tab selects it directly.
    await user.click(screen.getByRole("tab", { name: "Resources" }));
    expect(screen.getByRole("tab", { name: "Resources" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("VirtualServerDetailsPanel Try-it flag", () => {
  beforeEach(() => {
    mswServer.use(
      http.get("*/servers/:id/resources", () => HttpResponse.json({ resources: [] })),
      http.get("*/servers/:id/prompts", () => HttpResponse.json({ prompts: [] })),
      http.get("*/gateways", () => HttpResponse.json({ gateways: [] })),
    );
  });

  it("keeps the drawer components-only when the flag is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", "false");
    mswServer.use(http.get("*/servers/:id/tools", () => HttpResponse.json({ tools: [] })));

    render(
      <VirtualServerDetailsPanel
        server={makeServer({
          associatedTools: ["Titled Tool"],
          associatedToolIds: ["titled-tool-id"],
        })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    expect(await screen.findByText("Titled Tool")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Try it" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Components" })).not.toBeInTheDocument();
    expect(screen.queryByText("Live tool call")).not.toBeInTheDocument();
  });

  it("shows a flag-gated Try-it tab using fetched tools", async () => {
    const user = userEvent.setup();
    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", "true");
    mswServer.use(
      http.get("*/servers/:id/tools", () =>
        HttpResponse.json({ tools: [makeTool({ id: "tool-1", displayName: "Find issues" })] }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer({
          id: "virtual-server-1",
          name: "Developer tools",
          associatedTools: ["Fallback Tool"],
          associatedToolIds: ["fallback-tool"],
        })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    const componentsTab = await screen.findByRole("tab", { name: "Components" });
    expect(componentsTab).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Try it" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Try it" }));

    expect(await screen.findByText("Live tool call")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live invoke" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.queryByText("Fallback Tool")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="tabs-content"][data-state="active"] pre'),
    ).toHaveTextContent('"server_id":"virtual-server-1"');
  });

  it("does not fall back to associatedToolIds for Try-it", async () => {
    const user = userEvent.setup();
    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", "true");
    mswServer.use(http.get("*/servers/:id/tools", () => HttpResponse.json({ tools: [] })));

    render(
      <VirtualServerDetailsPanel
        server={makeServer({
          associatedTools: ["Fallback Tool"],
          associatedToolIds: ["fallback-tool"],
        })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));

    expect(await screen.findByText("No attached tools are available to test.")).toBeInTheDocument();
    expect(screen.queryByText("Live tool call")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live invoke" })).not.toBeInTheDocument();
  });

  it("blocks Try-it when tools.execute is missing", async () => {
    const user = userEvent.setup();
    authMock.permissions = ["servers.use"];
    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", "true");
    mswServer.use(
      http.get("*/servers/:id/tools", () => HttpResponse.json({ tools: [makeTool()] })),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "virtual-server-1" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));

    expect(await screen.findByText("Live invoke requires tools.execute.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live invoke" })).toBeDisabled();
  });

  it("blocks Try-it when servers.use is missing", async () => {
    const user = userEvent.setup();
    authMock.permissions = ["tools.execute"];
    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", "true");
    mswServer.use(
      http.get("*/servers/:id/tools", () => HttpResponse.json({ tools: [makeTool()] })),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "virtual-server-1" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));

    expect(await screen.findByText("Live invoke requires servers.use.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live invoke" })).toBeDisabled();
  });
});

describe("VirtualServerDetailsPanel render variants", () => {
  beforeEach(() => {
    mswServer.use(
      http.get("*/servers/:id/tools", () => HttpResponse.json({ tools: [] })),
      http.get("*/servers/:id/resources", () => HttpResponse.json({ resources: [] })),
      http.get("*/servers/:id/prompts", () => HttpResponse.json({ prompts: [] })),
    );
  });

  it("shows the internal visibility label", async () => {
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ visibility: "public" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    expect(await screen.findByText("Internal")).toBeInTheDocument();
  });

  it("renders the visibility info popover trigger showing only the selected level", async () => {
    const user = userEvent.setup();
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ visibility: "public" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "About visibility levels" }));

    expect(
      await screen.findByText(
        "Visible to everyone signed into this platform. Not on the public internet.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Only you can see this/)).not.toBeInTheDocument();
  });

  it("shows the private visibility label", async () => {
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ visibility: "private" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    expect(await screen.findByText("Private")).toBeInTheDocument();
  });

  it("shows N/A when the server has no version", async () => {
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ version: undefined })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    expect(await screen.findByText("N/A")).toBeInTheDocument();
  });

  it("shows the inactive status for a disabled server", async () => {
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ enabled: false })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });

  it("shows an empty state when the server has no components", async () => {
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "empty-server" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    expect(await screen.findByText(/No components found/i)).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <VirtualServerDetailsPanel
        server={makeServer()}
        error={null}
        open
        onClose={onClose}
        onAddSources={vi.fn()}
      />,
    );
    await screen.findByRole("tab", { name: "All" });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("handles component responses returned as bare arrays", async () => {
    mswServer.use(
      http.get("*/servers/:id/tools", () =>
        HttpResponse.json([{ id: "t1", name: "arr_tool", originalName: "arr_tool" }]),
      ),
      http.get("*/servers/:id/resources", () => HttpResponse.json([])),
      http.get("*/servers/:id/prompts", () => HttpResponse.json([])),
    );
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "arr-server" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    expect(await screen.findByText("arr_tool")).toBeInTheDocument();
  });

  it("ignores non-arrow keys on the component tabs", async () => {
    const user = userEvent.setup();
    render(
      <VirtualServerDetailsPanel
        server={makeServer()}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    const allTab = await screen.findByRole("tab", { name: "All" });
    allTab.focus();
    await user.keyboard("{Enter}");
    // A non-navigation key leaves the active tab unchanged.
    expect(allTab).toHaveAttribute("aria-selected", "true");
  });
});
