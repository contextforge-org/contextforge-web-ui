import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { renderWithProviders as render } from "@/test/test-utils";
import { server as mswServer } from "@/test/mocks/server";
import type { Tool } from "@/types/tool";
import { ToolTryItTab } from "./ToolTryItTab";

const authMock = vi.hoisted(() => ({ permissionsLoading: false }));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      permission === "tools.execute" || permission === "servers.use",
    permissionsLoading: authMock.permissionsLoading,
  }),
}));

beforeEach(() => {
  authMock.permissionsLoading = false;
});

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
    expect(
      screen.queryByText("Writes, external requests, and quota use happen immediately."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear selected tool/i })).not.toBeInTheDocument();

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

  it("defaults scoped testing to preview and switches snippets with live mode", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const selectedTool = makeTool({
      name: "github.search_issues",
      displayName: "Search issues",
      annotations: { readOnlyHint: true },
    });

    render(
      <ToolTryItTab
        onClear={onClear}
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={selectedTool}
      />,
    );

    expect(screen.getByRole("heading", { name: "Test tool" })).toBeInTheDocument();
    expect(screen.getByText("Search issues")).toBeInTheDocument();
    expect(screen.queryByText("Search repository issues")).not.toBeInTheDocument();
    expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear selected tool and return to components" }),
    ).toHaveTextContent("Clear");
    expect(screen.getByText("Live invocation")).toHaveAttribute("data-slot", "label");
    expect(
      screen.getByRole("button", {
        name: "Writes, external requests, and quota use happen immediately.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Writes, external requests, and quota use happen immediately."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Live invocation is enabled/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live invoke" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "JSON" })).toBeInTheDocument();
    expect(activeCode()).toContain("/v1/tools/preview/github.search_issues");
    expect(activeCode()).toContain('"server_id":"virtual-server-1"');

    await user.click(screen.getByRole("switch", { name: "Live invocation" }));

    expect(
      screen.getByText(
        "Live invocation is enabled. Review your arguments carefully or switch back to preview mode.",
      ),
    ).toBeVisible();
    const liveWarning = screen.getByText(/Live invocation is enabled/).closest('[role="status"]');
    expect(liveWarning).toHaveClass("bg-muted");
    expect(liveWarning?.querySelector("svg")).toHaveClass("text-warning");
    expect(screen.getByRole("button", { name: "Invoke tool" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "JSON-RPC" })).toBeInTheDocument();
    expect(activeCode()).toContain("$MCPGATEWAY_URL/rpc");
    await user.click(screen.getByRole("tab", { name: "JSON-RPC" }));
    expect(activeCode()).toContain('"server_id": "virtual-server-1"');
    expect(activeCode()).toContain('"name": "github.search_issues"');

    await user.click(screen.getByRole("switch", { name: "Live invocation" }));
    expect(screen.queryByText(/Live invocation is enabled/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invoke tool" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "JSON" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "curl" })).toHaveAttribute("data-state", "active");
    expect(activeCode()).toContain("/v1/tools/preview/github.search_issues");
    expect(activeCode()).toContain('"server_id":"virtual-server-1"');

    await user.click(
      screen.getByRole("button", { name: "Clear selected tool and return to components" }),
    );
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("disables live mode while access is being checked and describes why", () => {
    authMock.permissionsLoading = true;
    const selectedTool = makeTool({ annotations: { readOnlyHint: true } });

    render(
      <ToolTryItTab
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={selectedTool}
      />,
    );

    const liveSwitch = screen.getByRole("switch", { name: "Live invocation" });
    expect(liveSwitch).toBeDisabled();
    expect(liveSwitch).toHaveAccessibleDescription(
      "Writes, external requests, and quota use happen immediately. Checking your tool permissions.",
    );
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("reveals argument errors on preview attempt without sending an invalid request", async () => {
    const user = userEvent.setup();
    const selectedTool = makeTool({ annotations: { readOnlyHint: true } });
    let previewCalls = 0;
    mswServer.use(
      http.post("*/v1/tools/preview/:name", () => {
        previewCalls += 1;
        return HttpResponse.json({
          validated: true,
          target: { kind: "local" },
          resolvedArguments: {},
          annotations: {},
        });
      }),
    );

    render(
      <ToolTryItTab
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={selectedTool}
      />,
    );

    const query = screen.getByLabelText(/query/i);
    const previewButton = screen.getByRole("button", { name: "Preview" });
    expect(query).toHaveAttribute("aria-invalid", "false");
    expect(previewButton).toBeEnabled();

    await user.click(previewButton);
    expect(query).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(previewCalls).toBe(0);

    await user.type(query, "cloudflare");
    expect(query).toHaveAttribute("aria-invalid", "false");
    await user.click(previewButton);
    await waitFor(() => expect(previewCalls).toBe(1));
  });

  it("reveals argument errors on live invoke without sending an invalid request", async () => {
    const user = userEvent.setup();
    const selectedTool = makeTool({ annotations: { readOnlyHint: true } });
    let invokeCalls = 0;
    mswServer.use(
      http.post("*/rpc", async ({ request }) => {
        invokeCalls += 1;
        const envelope = (await request.json()) as { id: string };
        return HttpResponse.json({ jsonrpc: "2.0", id: envelope.id, result: { content: [] } });
      }),
    );

    render(
      <ToolTryItTab
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={selectedTool}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Live invocation" }));
    const query = screen.getByLabelText(/query/i);
    const invokeButton = screen.getByRole("button", { name: "Invoke tool" });
    expect(invokeButton).toBeEnabled();

    await user.click(invokeButton);
    expect(query).toHaveAttribute("aria-invalid", "true");
    expect(invokeCalls).toBe(0);

    await user.type(query, "cloudflare");
    await user.click(invokeButton);
    await waitFor(() => expect(invokeCalls).toBe(1));
  });

  it("resets visible argument validation when switching tools", async () => {
    const user = userEvent.setup();
    const firstTool = makeTool({ id: "tool-one" });
    const secondTool = makeTool({ id: "tool-two", name: "list_issues" });
    const { rerender } = render(
      <ToolTryItTab
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={firstTool}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByLabelText(/query/i)).toHaveAttribute("aria-invalid", "true");

    rerender(
      <ToolTryItTab
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={secondTool}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/query/i)).toHaveAttribute("aria-invalid", "false"),
    );
    expect(screen.queryByText("Required")).not.toBeInTheDocument();
  });

  it("clears preview and live results when switching modes", async () => {
    const user = userEvent.setup();
    const selectedTool = makeTool({ annotations: { readOnlyHint: true } });
    let previewCalls = 0;
    mswServer.use(
      http.post("*/v1/tools/preview/:name", () => {
        previewCalls += 1;
        return HttpResponse.json({
          validated: true,
          target: { kind: "local" },
          resolvedArguments: { query: "cloudflare" },
          annotations: {},
        });
      }),
      http.post("*/rpc", async ({ request }) => {
        const envelope = (await request.json()) as { id: string };
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: envelope.id,
          result: { content: [{ type: "text", text: "live result" }] },
        });
      }),
    );

    render(
      <ToolTryItTab
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={selectedTool}
      />,
    );

    await user.type(screen.getByLabelText(/query/i), "cloudflare");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Preview 200")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Live invocation" }));
    expect(screen.queryByText("Preview 200")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Invoke tool" }));
    expect(await screen.findByText("Live invoke 200")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Live invocation" }));
    expect(screen.queryByText("Live invoke 200")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(previewCalls).toBe(2));
    expect(await screen.findByText("Preview 200")).toBeInTheDocument();
  });

  it("keeps scoped preview available when live invocation is unsafe", async () => {
    const user = userEvent.setup();
    const selectedTool = makeTool({ annotations: {}, gatewayId: "gateway-id" });

    render(
      <ToolTryItTab
        serverScope={{ serverId: "virtual-server-1", serverName: "Developer tools" }}
        selectedTool={selectedTool}
      />,
    );

    await user.type(screen.getByLabelText(/query/i), "cloudflare");
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Live invocation" })).toBeDisabled();
    expect(
      screen.getByText("Live invoke is not offered for federated tools without readOnlyHint."),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Live invocation" })).toHaveAccessibleDescription(
      "Writes, external requests, and quota use happen immediately. Live invoke is not offered for federated tools without readOnlyHint.",
    );
  });
});
