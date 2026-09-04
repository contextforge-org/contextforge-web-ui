import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server as mswServer } from "@/test/mocks/server";
import { renderWithProviders as render } from "@/test/test-utils";
import { VirtualServerDetailsPanel } from "./VirtualServerDetailsPanel";
import type { VirtualServer } from "@/types/server";
import { copyToClipboard } from "@/lib/clipboard";

vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn() }));

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
    const user = userEvent.setup();
    renderWithComponents();
    await user.click(await screen.findByRole("tab", { name: "Components" }));

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
    await user.click(await screen.findByRole("tab", { name: "Components" }));

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
    await user.click(await screen.findByRole("tab", { name: "Components" }));

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

    await user.click(await screen.findByRole("tab", { name: "Components" }));

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
    await user.click(await screen.findByRole("tab", { name: "Components" }));

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
    const user = userEvent.setup();
    render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "empty-server" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole("tab", { name: "Components" }));
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
    await screen.findByText(/^endpoint$/i);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("handles component responses returned as bare arrays", async () => {
    const user = userEvent.setup();
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
    await user.click(await screen.findByRole("tab", { name: "Components" }));

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
    await user.click(await screen.findByRole("tab", { name: "Components" }));
    const allTab = await screen.findByRole("tab", { name: "All" });
    allTab.focus();
    await user.keyboard("{Enter}");
    // A non-navigation key leaves the active tab unchanged.
    expect(allTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("VirtualServerDetailsPanel test connection tab", () => {
  const HANDSHAKE_ENDPOINT = "*/v1/virtual-servers/:serverId/test-handshake";

  beforeEach(() => {
    mswServer.use(
      http.get("*/servers/:id/tools", () => HttpResponse.json({ tools: [] })),
      http.get("*/servers/:id/resources", () => HttpResponse.json({ resources: [] })),
      http.get("*/servers/:id/prompts", () => HttpResponse.json({ prompts: [] })),
    );
  });

  it("renders the Try it and Components top-level tabs", async () => {
    render(
      <VirtualServerDetailsPanel
        server={makeServer()}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    expect(await screen.findByRole("tab", { name: "Components" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Try it" })).toBeInTheDocument();
  });

  it("switches to the test panel and shows the handshake form", async () => {
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

    await user.click(await screen.findByRole("tab", { name: "Try it" }));

    expect(screen.getByRole("button", { name: /^test connection$/i })).toBeInTheDocument();
    expect(screen.getByText(/run a test to open a mcp session/i)).toBeInTheDocument();
  });

  it("runs a handshake and displays a successful result", async () => {
    const user = userEvent.setup();
    mswServer.use(
      http.post(HANDSHAKE_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 42,
          serverName: "Test MCP",
        }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer()}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^connection test$/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/latency: 42 ms/i)).toBeInTheDocument();
  });

  it("flags a component-count mismatch using the panel's own aggregated counts", async () => {
    const user = userEvent.setup();
    mswServer.use(
      http.get("*/servers/:id/tools", () =>
        HttpResponse.json({ tools: [{ id: "t1", name: "tool-1", originalName: "tool-1" }] }),
      ),
      http.post(HANDSHAKE_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 10,
          componentCounts: { tools: 0 },
        }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer()}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^connection test$/i)).toBeInTheDocument();
    });
    expect(
      await screen.findByText(/counts don.t match the virtual server.s aggregate/i),
    ).toBeInTheDocument();
  });

  it("excludes disabled components from the aggregate used for the handshake comparison", async () => {
    // The drawer's own queries pass include_inactive=true, but the handshake's
    // component_counts only ever reflect enabled components — a disabled tool
    // must not count toward the aggregate or it would permanently mismatch.
    const user = userEvent.setup();
    mswServer.use(
      http.get("*/servers/:id/tools", () =>
        HttpResponse.json({
          tools: [
            { id: "t1", name: "tool-1", originalName: "tool-1", enabled: true },
            { id: "t2", name: "tool-2", originalName: "tool-2", enabled: false },
          ],
        }),
      ),
      http.post(HANDSHAKE_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 10,
          componentCounts: { tools: 1 },
        }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer()}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^connection test$/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();
  });

  it("suppresses the mismatch banner when one component query fails", async () => {
    // If the resources query errors while tools succeeds, the aggregate must
    // not silently treat the failed query as a count of 0 — that would flag
    // a mismatch against a handshake that actually agrees.
    const user = userEvent.setup();
    mswServer.use(
      http.get("*/servers/:id/tools", () =>
        HttpResponse.json({ tools: [{ id: "t1", name: "tool-1", originalName: "tool-1" }] }),
      ),
      http.get("*/servers/:id/resources", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
      http.post(HANDSHAKE_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 10,
          componentCounts: { tools: 1, resources: 2 },
        }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer()}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^connection test$/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();
  });

  it("suppresses the mismatch banner when all component queries fail, even with a disabled component", async () => {
    // When every component query fails, the panel would otherwise fall back
    // to buildComponentItems(server), which carries no `enabled` field and
    // can't exclude disabled components from the aggregate.
    const user = userEvent.setup();
    mswServer.use(
      http.get("*/servers/:id/tools", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
      http.get("*/servers/:id/resources", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
      http.get("*/servers/:id/prompts", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
      http.post(HANDSHAKE_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 10,
          componentCounts: { tools: 1 },
        }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer({
          associatedTools: ["tool-1", "tool-2"],
          associatedToolIds: ["t1", "t2"],
        })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^connection test$/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();
  });

  it("suppresses the mismatch banner while a component query is still loading", async () => {
    // Before all three queries have resolved, the aggregate must not stand
    // in as {0,0,0} and get compared against the handshake — that flags a
    // spurious mismatch during the loading window, which is longest when a
    // query hangs rather than erroring outright.
    const user = userEvent.setup();
    mswServer.use(
      http.get("*/servers/:id/tools", async () => {
        await delay("infinite");
        return HttpResponse.json({ tools: [] });
      }),
      http.post(HANDSHAKE_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 10,
          componentCounts: { tools: 1 },
        }),
      ),
    );

    render(
      <VirtualServerDetailsPanel
        server={makeServer({ associatedTools: ["tool-1"], associatedToolIds: ["t1"] })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Try it" }));
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^connection test$/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();
  });

  it("resets to the try-it tab when a new server is selected", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "s1" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Components" }));
    expect(await screen.findByRole("tab", { name: "All" })).toBeInTheDocument();

    // Simulate opening a different server — the panel resets to Try it.
    rerender(
      <VirtualServerDetailsPanel
        server={makeServer({ id: "s2" })}
        error={null}
        open
        onClose={vi.fn()}
        onAddSources={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Try it" })).toHaveAttribute("aria-selected", "true");
    });
  });
});
