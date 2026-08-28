import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import { toolsApi } from "@/api/tools";
import type { Tool } from "@/types/tool";
import { ToolTryItTab } from "./ToolTryItTab";

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      permission === "tools.execute" || permission === "servers.use",
    permissionsLoading: false,
  }),
}));

function activeCode(): string {
  const pre = document.querySelector('[data-slot="tabs-content"][data-state="active"] pre');
  return pre?.textContent ?? "";
}

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: "tool-search",
    name: "search_issues",
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
    annotations: {},
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

describe("ToolTryItTab", () => {
  it("renders live tools/call snippets against a gateway placeholder", async () => {
    const user = userEvent.setup();
    const selectedTool = makeTool({ annotations: { readOnlyHint: true } });

    render(
      <ToolTryItTab tools={[selectedTool]} selectedTool={selectedTool} onSelectTool={vi.fn()} />,
    );

    expect(screen.getByRole("tab", { name: "curl" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "JSON-RPC" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Python" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "TypeScript" })).toBeInTheDocument();
    expect(screen.getByText("MCP 2025-11-25")).toBeInTheDocument();
    expect(activeCode()).toContain("$MCPGATEWAY_URL/rpc");
    expect(activeCode()).toContain('"method":"tools/call"');
    expect(activeCode()).toContain('"name":"search_issues"');
    expect(activeCode()).not.toContain("/api/rpc");

    await user.type(screen.getByLabelText(/query/i), "cloudflare");
    expect(screen.getByRole("button", { name: "Live invoke" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "JSON-RPC" }));
    expect(activeCode()).toContain('"method": "tools/call"');
    expect(activeCode()).toContain('"name": "search_issues"');
    expect(activeCode()).not.toContain("server_id");
  });

  it("preserves draft arguments and headers when the same tool is refreshed", async () => {
    const user = userEvent.setup();
    const selectedTool = makeTool();
    const refreshedTool = makeTool({
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
        },
      },
    });

    const { rerender } = render(
      <ToolTryItTab tools={[selectedTool]} selectedTool={selectedTool} onSelectTool={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/query/i), "cloudflare");
    await user.click(screen.getByRole("button", { name: "Add header" }));
    await user.type(screen.getByLabelText("Header 1 name"), "X-Tenant-Id");
    await user.type(screen.getByLabelText("Header 1 value"), "team-a");

    rerender(
      <ToolTryItTab tools={[refreshedTool]} selectedTool={refreshedTool} onSelectTool={vi.fn()} />,
    );

    expect(screen.getByLabelText(/query/i)).toHaveValue("cloudflare");
    expect(screen.getByLabelText("Header 1 name")).toHaveValue("X-Tenant-Id");
    expect(screen.getByLabelText("Header 1 value")).toHaveValue("team-a");
  });

  it("renders live-only scoped mode without preview UI or preview requests", async () => {
    const user = userEvent.setup();
    const previewSpy = vi.spyOn(toolsApi, "preview");
    const selectedTool = makeTool({
      name: "github.search_issues",
      displayName: "Search issues",
      annotations: { readOnlyHint: true },
    });

    render(
      <ToolTryItTab
        getToolLabel={(tool) => tool.displayName ?? tool.name}
        invokeScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        previewEnabled={false}
        selectedTool={selectedTool}
        tools={[selectedTool]}
        onSelectTool={vi.fn()}
      />,
    );

    expect(screen.getByText("Live tool call")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.queryByText("Tool preview")).not.toBeInTheDocument();
    expect(activeCode()).toContain('"server_id":"virtual-server-1"');

    await user.click(screen.getByRole("tab", { name: "JSON-RPC" }));
    expect(activeCode()).toContain('"server_id": "virtual-server-1"');
    expect(activeCode()).toContain('"name": "github.search_issues"');
    expect(previewSpy).not.toHaveBeenCalled();
  });
});
