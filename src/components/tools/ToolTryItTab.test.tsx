import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import type { Tool } from "@/types/tool";
import { ToolTryItTab } from "./ToolTryItTab";

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
});
