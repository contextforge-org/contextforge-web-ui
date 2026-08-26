import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import type { ToolInvokeState } from "@/hooks/useToolInvoke";
import type { Tool } from "@/types/tool";
import { resolveToolLiveInvokeAvailability, ToolLiveInvokeGate } from "./ToolLiveInvokeGate";

const mockHasPermission = vi.fn((_perm: string) => true);
let mockPermissionsLoading = false;

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    hasPermission: mockHasPermission,
    permissionsLoading: mockPermissionsLoading,
  }),
}));

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: "tool-search",
    name: "search_issues",
    originalName: "search_issues",
    description: "Search repository issues",
    originalDescription: "Search repository issues",
    title: "Search issues",
    displayName: "Search issues",
    gatewayId: null,
    gatewaySlug: "local",
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
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object" },
    ...overrides,
  };
}

function makeInvoke(
  overrides: Partial<Pick<ToolInvokeState, "run" | "stopWaiting" | "isLoading" | "hasRun">> = {},
): Pick<ToolInvokeState, "run" | "stopWaiting" | "isLoading" | "hasRun"> {
  return {
    run: vi.fn(),
    stopWaiting: vi.fn(),
    isLoading: false,
    hasRun: false,
    ...overrides,
  };
}

describe("resolveToolLiveInvokeAvailability", () => {
  it("checks permissions before annotations", () => {
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: false,
        canUseServers: true,
        permissionsLoading: false,
        tool: { annotations: { readOnlyHint: true }, gatewayId: null },
      }),
    ).toEqual({ state: "missingPermission", permission: "tools.execute" });
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: true,
        canUseServers: false,
        permissionsLoading: false,
        tool: { annotations: { readOnlyHint: true }, gatewayId: null },
      }),
    ).toEqual({ state: "missingPermission", permission: "servers.use" });
  });

  it("allows read-only tools including federated tools", () => {
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: true,
        canUseServers: true,
        permissionsLoading: false,
        tool: { annotations: { readOnlyHint: true }, gatewayId: "gw-1" },
      }),
    ).toEqual({ state: "available" });
  });

  it("requires confirmation for local destructive tools", () => {
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: true,
        canUseServers: true,
        permissionsLoading: false,
        tool: { annotations: { destructiveHint: true }, gatewayId: null },
      }),
    ).toEqual({ state: "requiresConfirmation" });
  });

  it("treats destructiveHint as higher priority than readOnlyHint", () => {
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: true,
        canUseServers: true,
        permissionsLoading: false,
        tool: {
          annotations: { readOnlyHint: true, destructiveHint: true },
          gatewayId: null,
        },
      }),
    ).toEqual({ state: "requiresConfirmation" });
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: true,
        canUseServers: true,
        permissionsLoading: false,
        tool: {
          annotations: { readOnlyHint: true, destructiveHint: true },
          gatewayId: "gw-1",
        },
      }),
    ).toEqual({ state: "unavailableFederated" });
  });

  it("does not offer federated or untagged tools pending approval policy", () => {
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: true,
        canUseServers: true,
        permissionsLoading: false,
        tool: { annotations: {}, gatewayId: "gw-1" },
      }),
    ).toEqual({ state: "unavailableFederated" });
    expect(
      resolveToolLiveInvokeAvailability({
        canExecute: true,
        canUseServers: true,
        permissionsLoading: false,
        tool: { annotations: {}, gatewayId: null },
      }),
    ).toEqual({ state: "unavailableUntagged" });
  });
});

describe("ToolLiveInvokeGate", () => {
  beforeEach(() => {
    mockHasPermission.mockReset();
    mockHasPermission.mockReturnValue(true);
    mockPermissionsLoading = false;
  });

  it("runs immediately for read-only tools", async () => {
    const user = userEvent.setup();
    const invoke = makeInvoke();
    render(
      <ToolLiveInvokeGate
        tool={makeTool({ annotations: { readOnlyHint: true } })}
        invoke={invoke}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Live invoke" }));

    expect(invoke.run).toHaveBeenCalledTimes(1);
    expect(mockHasPermission).toHaveBeenCalledWith("tools.execute");
    expect(mockHasPermission).toHaveBeenCalledWith("servers.use");
  });

  it("confirms local destructive tools before running", async () => {
    const user = userEvent.setup();
    const invoke = makeInvoke();
    render(
      <ToolLiveInvokeGate
        tool={makeTool({ annotations: { destructiveHint: true }, name: "delete_issue" })}
        invoke={invoke}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Live invoke" }));
    const dialog = screen.getByRole("alertdialog", { name: "Invoke destructive tool" });
    expect(dialog).toHaveTextContent('Invoke "delete_issue" against the live gateway?');

    await user.click(screen.getByRole("button", { name: "Invoke tool" }));

    expect(invoke.run).toHaveBeenCalledTimes(1);
  });

  it("shows RBAC and loading gates", () => {
    mockHasPermission.mockImplementation((permission) => permission !== "tools.execute");
    const { rerender } = render(
      <ToolLiveInvokeGate
        tool={makeTool({ annotations: { readOnlyHint: true } })}
        invoke={makeInvoke()}
      />,
    );

    expect(screen.getByText("Live invoke requires tools.execute.")).toBeInTheDocument();

    mockHasPermission.mockImplementation((permission) => permission === "tools.execute");
    rerender(
      <ToolLiveInvokeGate
        tool={makeTool({ annotations: { readOnlyHint: true } })}
        invoke={makeInvoke()}
      />,
    );
    expect(screen.getByText("Live invoke requires servers.use.")).toBeInTheDocument();

    mockHasPermission.mockReturnValue(true);
    mockPermissionsLoading = true;
    rerender(
      <ToolLiveInvokeGate
        tool={makeTool({ annotations: { readOnlyHint: true } })}
        invoke={makeInvoke()}
      />,
    );
    expect(screen.getByRole("button", { name: "Checking access" })).toBeDisabled();
    expect(screen.getByText("Checking your tool permissions.")).toBeInTheDocument();

    mockPermissionsLoading = false;
  });

  it("cancels active live invokes", async () => {
    const user = userEvent.setup();
    const invoke = makeInvoke({ isLoading: true });
    render(
      <ToolLiveInvokeGate
        tool={makeTool({ annotations: { readOnlyHint: true } })}
        invoke={invoke}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel request" }));

    expect(invoke.stopWaiting).toHaveBeenCalledTimes(1);
  });
});
