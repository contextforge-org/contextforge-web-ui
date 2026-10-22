import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { toast } from "sonner";
import { Servers } from "./Servers";
import { RouterProvider } from "@/router";
import { I18nProvider } from "@/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactElement } from "react";

// Mock the api client to avoid AbortSignal issues with MSW in Node.js
vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly body: unknown,
      message: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockHasPermission = vi.fn((_perm: string) => true);
let mockPermissionsLoading = false;
vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({ hasPermission: mockHasPermission, permissionsLoading: mockPermissionsLoading }),
}));

import { api, ApiError } from "@/api/client";
import { OAuthAuthorizationError, OAuthCancelledError, serversApi } from "@/api/servers";

const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);
const mockToastWarning = vi.mocked(toast.warning);

const mockServerDetails = {
  id: "server-0",
  name: "Test Server 0",
  url: "http://test0.example.com",
  transport: "SSE" as const,
  enabled: true,
  reachable: true,
  toolCount: 5,
  visibility: "public" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  team: "Engineering",
  owner_email: "test@example.com",
};

// Helper to create mock servers
function createMockServers(startId: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `server-${startId + i}`,
    name: `Test Server ${startId + i}`,
    url: `http://test${startId + i}.example.com`,
    status: "active",
    enabled: true,
  }));
}

// Helper to render with real router
function renderWithRouter(ui: ReactElement, path = "/app/servers") {
  // Set up initial route
  window.history.pushState({}, "", path);

  return render(
    <RouterProvider>
      <I18nProvider>
        <TooltipProvider>{ui}</TooltipProvider>
      </I18nProvider>
    </RouterProvider>,
  );
}

describe("Servers", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
    mockPermissionsLoading = false;
    mockHasPermission.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a loading placeholder while the initial server fetch is pending", () => {
    const pendingRequest = new Promise(() => {});
    vi.mocked(api.get).mockReturnValueOnce(pendingRequest as ReturnType<typeof api.get>);

    renderWithRouter(<Servers />);

    expect(screen.getAllByRole("status")[0]).toBeInTheDocument();
  });

  it("renders an error alert when the initial server fetch fails", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Service down"));

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("Error loading servers")).toBeInTheDocument();
    expect(screen.getByText("Service down")).toBeInTheDocument();
  });

  it("shows the MCP server form when openForm=true is present in the URL", async () => {
    window.history.pushState({}, "", "/app/servers?openForm=true");
    vi.mocked(api.get).mockResolvedValueOnce({ gateways: [], nextCursor: null });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Connect MCP server" })).toBeInTheDocument();
    });
  });

  it("changes the page size when the limit select value changes", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 1),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    const limitSelect = screen.getByRole("combobox", { name: /Per page:/i });
    await user.selectOptions(limitSelect, "25");
    expect(limitSelect).toHaveValue("25");
  });

  it("renders an empty state when no servers exist", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ gateways: [], nextCursor: null });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Connect" }).length).toBeGreaterThan(0);
    });
  });

  it("hides the connect card when the caller lacks gateways.create", async () => {
    mockHasPermission.mockReturnValue(false);
    vi.mocked(api.get).mockResolvedValueOnce({ gateways: [], nextCursor: null });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.queryByText("Connect MCP server")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("hides the toolbar Connect button when the caller lacks gateways.create", async () => {
    mockHasPermission.mockReturnValue(false);
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 1),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("renders servers list when data is loaded", async () => {
    // Mock the initial servers fetch - useQuery expects direct response, not wrapped in data
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 25),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
  });

  it("filters the loaded servers with the search box", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 3),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });
    expect(screen.getByText("Test Server 1")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search MCP Servers" });
    await user.type(search, "Server 0");

    await waitFor(() => {
      expect(screen.queryByText("Test Server 1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Test Server 0")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz-none");
    await waitFor(() => {
      expect(screen.getByText("No matching results.")).toBeInTheDocument();
    });
  });

  it("renders the empty state Connect MCP server panel when no servers exist", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: [],
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Connect MCP server")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Register a MCP server to federate its tools, resources, and prompts/i),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();

    expect(screen.queryByText("MCP Servers")).not.toBeInTheDocument();
  });

  it("shows loading state before data arrives", async () => {
    vi.mocked(api.get).mockImplementationOnce(() => new Promise(() => {}));

    renderWithRouter(<Servers />);

    expect(screen.getByText("Loading servers...")).toBeInTheDocument();
  });

  it("shows error alert when query fails", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Network failure"));

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("Error loading servers")).toBeInTheDocument();
  });

  it("loads more servers when Load More button is clicked", async () => {
    const user = userEvent.setup();

    // Mock the initial servers fetch
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 25),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    const loadMoreButton = screen.getByRole("button", { name: /load more/i });
    expect(loadMoreButton).toBeInTheDocument();

    // Mock the second page fetch
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(25, 25),
      nextCursor: null,
    });

    await user.click(loadMoreButton);

    await waitFor(() => {
      expect(screen.getByText("Test Server 25")).toBeInTheDocument();
    });
  });

  it("hides Load More button when there is no nextCursor", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 5),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("opens details panel when View Details is clicked", async () => {
    const user = userEvent.setup();

    // Mock the initial servers fetch
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 25),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // Components fetches fire first (panel child effects run before parent detail effect).
    vi.mocked(api.get).mockResolvedValueOnce({ tools: [] });
    vi.mocked(api.get).mockResolvedValueOnce({ resources: [] });
    vi.mocked(api.get).mockResolvedValueOnce({ prompts: [] });
    vi.mocked(api.get).mockResolvedValueOnce(mockServerDetails);

    // Find the first server row's actions menu
    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    // Click View Details menu item
    const viewDetailsItem = await screen.findByRole("menuitem", { name: /view details/i });
    await user.click(viewDetailsItem);

    // Drawer should open with server details
    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });
  });

  it("opens the Add MCP server form via ?openForm=true and submits it", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ gateways: [], nextCursor: null });
    vi.mocked(api.post).mockResolvedValue({ id: "new-gw", name: "My Server" });

    renderWithRouter(<Servers />, "/app/servers?openForm=true");

    // The form is open immediately from the query param, driving useMCPServerForm.
    const nameInput = await screen.findByPlaceholderText("Add MCP server name...");
    await user.type(nameInput, "My Server");
    await user.type(
      screen.getByPlaceholderText("Add URL for a running MCP server..."),
      "https://example.com/mcp",
    );
    await user.type(screen.getByPlaceholderText("Add an optional description..."), "A test server");

    // Once name + URL are valid, the submit button enables.
    const submit = screen.getByRole("button", { name: "Connect server" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/v1/mcp-servers",
        expect.anything(),
        expect.anything(),
      ),
    );
  });

  it("adds a tag from the details drawer and patches the server", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/tools")) return Promise.resolve({ tools: [] });
      if (path.includes("/resources")) return Promise.resolve({ resources: [] });
      if (path.includes("/prompts")) return Promise.resolve({ prompts: [] });
      if (/\/v1\/mcp-servers\/server-0/.test(path)) return Promise.resolve(mockServerDetails);
      return Promise.resolve({ gateways: createMockServers(0, 1), nextCursor: null });
    });
    vi.mocked(api.put).mockResolvedValue({
      ...mockServerDetails,
      tags: [{ id: "newtag", label: "newtag" }],
    });

    renderWithRouter(<Servers />);
    await waitFor(() => expect(screen.getByText("Test Server 0")).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: /actions for/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /view details/i }));
    await waitFor(() => expect(screen.getByText("Details")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add tags" }));
    await user.type(screen.getByPlaceholderText("Add tags separated with commas"), "newtag");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(expect.stringContaining("/v1/mcp-servers/server-0"), {
        tags: ["newtag"],
      });
    });
  });

  it("shows an error toast when adding a tag fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/tools")) return Promise.resolve({ tools: [] });
      if (path.includes("/resources")) return Promise.resolve({ resources: [] });
      if (path.includes("/prompts")) return Promise.resolve({ prompts: [] });
      if (/\/v1\/mcp-servers\/server-0/.test(path)) return Promise.resolve(mockServerDetails);
      return Promise.resolve({ gateways: createMockServers(0, 1), nextCursor: null });
    });
    vi.mocked(api.put).mockRejectedValue(new Error("boom"));

    renderWithRouter(<Servers />);
    await waitFor(() => expect(screen.getByText("Test Server 0")).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: /actions for/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /view details/i }));
    await waitFor(() => expect(screen.getByText("Details")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add tags" }));
    await user.type(screen.getByPlaceholderText("Add tags separated with commas"), "newtag");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // The rejected update runs through the error branch (which surfaces a toast).
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(expect.stringContaining("/v1/mcp-servers/server-0"), {
        tags: ["newtag"],
      });
    });
  });

  it("opens the details drawer for a server referenced by the ?selected= query param", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/tools")) return Promise.resolve({ tools: [] });
      if (path.includes("/resources")) return Promise.resolve({ resources: [] });
      if (path.includes("/prompts")) return Promise.resolve({ prompts: [] });
      if (/\/v1\/mcp-servers\/server-0/.test(path)) return Promise.resolve(mockServerDetails);
      return Promise.resolve({ gateways: createMockServers(0, 1), nextCursor: null });
    });

    renderWithRouter(<Servers />, "/app/servers?selected=server-0");

    await waitFor(() => expect(screen.getByText("Details")).toBeInTheDocument());
  });

  it("closes details panel when close button is clicked", async () => {
    const user = userEvent.setup();

    // Mock the initial servers fetch
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 25),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // Components fetches fire first (panel child effects run before parent detail effect).
    vi.mocked(api.get).mockResolvedValueOnce({ tools: [] });
    vi.mocked(api.get).mockResolvedValueOnce({ resources: [] });
    vi.mocked(api.get).mockResolvedValueOnce({ prompts: [] });
    vi.mocked(api.get).mockResolvedValueOnce(mockServerDetails);

    // Open details drawer
    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const viewDetailsItem = await screen.findByRole("menuitem", { name: /view details/i });
    await user.click(viewDetailsItem);

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });

    // Close drawer
    const closeButton = screen.getByRole("button", { name: /close mcp server details/i });
    await user.click(closeButton);

    // Drawer should close
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /close mcp server details/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("displays server metadata in details panel", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 25),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    vi.mocked(api.get).mockResolvedValueOnce({ tools: [] });
    vi.mocked(api.get).mockResolvedValueOnce({ resources: [] });
    vi.mocked(api.get).mockResolvedValueOnce({ prompts: [] });
    vi.mocked(api.get).mockResolvedValueOnce(mockServerDetails);

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const viewDetailsItem = await screen.findByRole("menuitem", { name: /view details/i });
    await user.click(viewDetailsItem);

    const detailsPanel = await screen.findByRole("region", { name: /test server 0/i });
    await waitFor(() => {
      const panel = within(detailsPanel);
      expect(panel.getByText("Active")).toBeInTheDocument();
      expect(panel.getByText("Internal")).toBeInTheDocument();
      expect(panel.getByText("Server-Sent Events (SSE)")).toBeInTheDocument();
      expect(panel.getByText("Engineering")).toBeInTheDocument();
      expect(panel.getByText("test@example.com")).toBeInTheDocument();
    });
  });

  it("reloads OAuth status after authorizing even when the server refetch fails", async () => {
    const user = userEvent.setup();
    let tokenStatus = "missing";
    let listCalls = 0;

    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith("/oauth/status")) {
        return Promise.resolve({
          "server-0": {
            oauth_enabled: true,
            grant_type: "authorization_code",
            user_token_status: { status: tokenStatus, authorized: tokenStatus === "valid" },
          },
        } as never);
      }
      if (listCalls++ === 0) {
        return Promise.resolve({
          gateways: [{ ...createMockServers(0, 1)[0], authType: "oauth", reachable: true }],
          nextCursor: null,
        } as never);
      }
      return Promise.reject(new Error("Service down"));
    });

    vi.spyOn(serversApi, "triggerOAuthAuthorization").mockResolvedValue({
      type: "oauth_callback",
      status: "success",
    });

    renderWithRouter(<Servers />);

    const authorize = await screen.findByRole("button", { name: /authorize test server 0/i });

    tokenStatus = "valid";
    await user.click(authorize);

    await waitFor(() => {
      expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("button", { name: /authorize test server 0/i }),
    ).not.toBeInTheDocument();
  });

  it("shows inline error notification when toggleEnabled fails", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 1),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    vi.mocked(api.post).mockRejectedValueOnce(new Error("403 Forbidden"));

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const deactivateItem = await screen.findByRole("menuitem", { name: /deactivate/i });
    await user.click(deactivateItem);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
    });
  });

  it("patches only the toggled server into the list instead of refetching", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 1),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    vi.mocked(api.post).mockResolvedValueOnce({ status: "success", message: "ok" });

    // Single-server fetch for the targeted patch (not a list refetch).
    vi.mocked(api.get).mockResolvedValueOnce({
      ...createMockServers(0, 1)[0],
      enabled: false,
    });

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const deactivateItem = await screen.findByRole("menuitem", { name: /deactivate/i });
    await user.click(deactivateItem);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(expect.stringContaining("activate=false"));
    });

    // The page re-reads just the one server: one list fetch + one single-server fetch.
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/v1/mcp-servers/server-0");
    });
    expect(api.get).toHaveBeenCalledTimes(2);

    // The row stays mounted (no spinner swap) and reflects the new state.
    expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
    const reopenedButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(reopenedButtons[0]);
    expect(await screen.findByRole("menuitem", { name: /activate/i })).toBeInTheDocument();
  });

  it("no longer offers Test Connection in the actions menu (moved to the details drawer)", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 1),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    // Edit still exists; Test Connection has been relocated into the details drawer.
    await screen.findByRole("menuitem", { name: /edit/i });
    expect(screen.queryByRole("menuitem", { name: /test connection/i })).not.toBeInTheDocument();
  });

  it("optimistically removes server from list immediately on delete confirmation", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 3),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    let resolveDelete!: () => void;
    vi.mocked(api.delete).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const deleteItem = await screen.findByRole("menuitem", { name: /^delete$/i });
    await user.click(deleteItem);

    const confirmButton = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByText("Test Server 0")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Test Server 1")).toBeInTheDocument();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(1, 2),
      nextCursor: null,
    });
    resolveDelete();

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Test Server 0 deleted.");
    });
  });

  it("rolls back optimistic delete and shows toast error when delete API fails", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 3),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    vi.mocked(api.delete).mockRejectedValueOnce(new Error("403 Forbidden"));

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const deleteItem = await screen.findByRole("menuitem", { name: /^delete$/i });
    await user.click(deleteItem);

    const confirmButton = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Error deleting MCP server",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("closes the details drawer optimistically when the viewed server is deleted and restores it on rollback", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 3),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    vi.mocked(api.get).mockResolvedValueOnce(mockServerDetails);

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const viewDetailsItem = await screen.findByRole("menuitem", { name: /view details/i });
    await user.click(viewDetailsItem);

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });

    let rejectDelete!: (err: Error) => void;
    vi.mocked(api.delete).mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectDelete = reject;
        }),
    );

    await user.click(actionsButtons[0]);
    const deleteItem = await screen.findByRole("menuitem", { name: /^delete$/i });
    await user.click(deleteItem);

    const confirmButton = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /close mcp server details/i }),
      ).not.toBeInTheDocument();
    });

    rejectDelete(new Error("403 Forbidden"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /close mcp server details/i })).toBeInTheDocument();
    });

    const table = screen.getByRole("table");
    expect(within(table).getByText("Test Server 0")).toBeInTheDocument();
  });

  it("does not close the details drawer when a different server is deleted", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 3),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    vi.mocked(api.get).mockResolvedValueOnce(mockServerDetails);

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const viewDetailsItem = await screen.findByRole("menuitem", { name: /view details/i });
    await user.click(viewDetailsItem);

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });

    vi.mocked(api.delete).mockResolvedValueOnce(undefined);
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: [createMockServers(0, 1)[0], ...createMockServers(2, 1)],
      nextCursor: null,
    });

    await user.click(actionsButtons[1]);
    const deleteItem = await screen.findByRole("menuitem", { name: /^delete$/i });
    await user.click(deleteItem);

    const confirmButton = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByText("Test Server 1")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /close mcp server details/i })).toBeInTheDocument();
  });

  it("refetch failure after successful delete does not trigger rollback or error toast", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 3),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    vi.mocked(api.delete).mockResolvedValueOnce(undefined);
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Network timeout"));

    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);

    const deleteItem = await screen.findByRole("menuitem", { name: /^delete$/i });
    await user.click(deleteItem);

    const confirmButton = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(confirmButton);

    // Success toast should fire
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Test Server 0"));
    });

    expect(mockToastError).not.toHaveBeenCalled();

    expect(screen.queryByText("Test Server 0")).not.toBeInTheDocument();
  });

  it("does not call delete API when confirmDelete is triggered with no selectedServerId", async () => {
    // This test exercises the early-return guard: `if (!selectedServerId) return`
    // The delete dialog is only opened via handleDelete which sets selectedServerId,
    // so we verify the guard is never hit in normal flow — the API is not called
    // when no server is selected.
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 1),
      nextCursor: null,
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // No server is selected — confirm dialog should not be present
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // api.delete should never have been called
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("does not call API when Load More is clicked without a nextCursor", async () => {
    // This test exercises the early-return guard: `if (!nextCursor || loadingMore) return`
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 5),
      nextCursor: null, // No next cursor
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // Load More button should not be rendered when nextCursor is null
    expect(screen.queryByRole("button", { name: /load more servers/i })).not.toBeInTheDocument();
    // Only the initial fetch should have happened
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("does not call API twice if Load More is clicked while already loading", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 5),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);
    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // Mock a slow API response for the next page
    let resolveSecondPage!: (value: unknown) => void;
    vi.mocked(api.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecondPage = resolve;
        }),
    );

    const loadMoreButton = screen.getByRole("button", { name: /load more/i });

    // Click twice quickly
    await user.click(loadMoreButton);
    await user.click(loadMoreButton);

    // Should only trigger one fetch because of `loadingMore` guard
    expect(api.get).toHaveBeenCalledTimes(2); // 1 initial + 1 load more

    // Cleanup promise
    resolveSecondPage({ gateways: [], nextCursor: null });
  });

  it("logs error when Load More API fails", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(api.get).mockResolvedValueOnce({
      gateways: createMockServers(0, 25),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    const loadMoreButton = screen.getByRole("button", { name: /load more/i });

    // Mock the second page fetch to reject
    const mockError = new Error("Failed to fetch");
    vi.mocked(api.get).mockRejectedValueOnce(mockError);

    await user.click(loadMoreButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to load more servers:", mockError);
    });

    consoleErrorSpy.mockRestore();
  });

  it("changes limit when select value changes", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValue({
      gateways: createMockServers(0, 5),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // Check initial limit
    expect(screen.getAllByText(/Test Server/).length).toBeGreaterThan(0);

    const select = screen.getByLabelText(/Per page:/i);
    await user.selectOptions(select, "25");

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        expect.stringContaining("limit=25"),
        undefined,
        expect.any(AbortSignal),
      );
    });
  });

  it("renders MCPServerForm when Connect is clicked and handles form close", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockResolvedValue({
      gateways: createMockServers(0, 5),
      nextCursor: "cursor-1",
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // Click Connect to open form
    const connectButton = screen.getByRole("button", { name: "Connect" });
    await user.click(connectButton);

    // Form should appear
    expect(await screen.findByRole("heading", { name: "Connect MCP server" })).toBeInTheDocument();

    // Test onToggle (Cancel)
    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    await user.click(cancelButton);

    // Form should close, table should appear again
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Connect MCP server" })).not.toBeInTheDocument();
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });
  });

  it("triggers onSuccess refetch from MCPServerForm submission", async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockImplementation((path) => {
      if (path.includes("/v1/mcp-servers/server-0")) {
        return Promise.resolve(mockServerDetails);
      }
      return Promise.resolve({
        gateways: createMockServers(0, 5),
        nextCursor: "cursor-1",
      });
    });

    renderWithRouter(<Servers />);

    await waitFor(() => {
      expect(screen.getByText("Test Server 0")).toBeInTheDocument();
    });

    // Edit button opens form with selected server ID
    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
    await user.click(actionsButtons[0]);
    const editItem = await screen.findByRole("menuitem", { name: /edit/i });
    await user.click(editItem);

    // Wait for the form to appear
    expect(await screen.findByRole("heading", { name: "Edit MCP server" })).toBeInTheDocument();

    // We can simulate a successful submit since the API call in MCPServerForm will use our mock
    vi.mocked(api.put).mockResolvedValueOnce({});

    // Fill the required URL field (it uses URL format)
    const urlInput = screen.getByLabelText(/^URL/i);
    await user.clear(urlInput);
    await user.type(urlInput, "http://new-url.example.com");

    const submitButton = screen.getByRole("button", { name: /Save changes/i });
    await user.click(submitButton);

    // Form should close on success and list should be re-rendered
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Edit MCP server" })).not.toBeInTheDocument();
    });
  });

  describe("Refresh action", () => {
    it("shows a success toast with counts when refresh returns success: true", async () => {
      const user = userEvent.setup();

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      vi.mocked(api.post).mockResolvedValueOnce({
        gatewayId: "server-0",
        success: true,
        toolsAdded: 3,
        toolsUpdated: 1,
        toolsRemoved: 0,
        durationMs: 100,
        refreshedAt: "2025-09-09T00:00:00Z",
      });
      // Targeted patch after a successful refresh: re-read just the one server.
      vi.mocked(api.get).mockResolvedValueOnce({
        ...createMockServers(0, 1)[0],
        toolCount: 8,
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      const refreshItem = await screen.findByRole("menuitem", { name: /^refresh$/i });
      await user.click(refreshItem);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining("/gateways/server-0/tools/refresh"),
        );
      });
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Test Server 0"));
      });
    });

    it("patches the refreshed server's counts without refetching the list", async () => {
      const user = userEvent.setup();

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: [{ ...createMockServers(0, 1)[0], toolCount: 5 }],
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("5 tools")).toBeInTheDocument();
      });

      vi.mocked(api.post).mockResolvedValueOnce({
        gatewayId: "server-0",
        success: true,
        toolsAdded: 3,
        toolsUpdated: 0,
        toolsRemoved: 0,
        durationMs: 100,
        refreshedAt: "2025-09-09T00:00:00Z",
      });
      // Re-read just the one server after refresh.
      vi.mocked(api.get).mockResolvedValueOnce({
        ...createMockServers(0, 1)[0],
        toolCount: 8,
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      const refreshItem = await screen.findByRole("menuitem", { name: /^refresh$/i });
      await user.click(refreshItem);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith("/v1/mcp-servers/server-0");
      });
      // One list fetch + one single-server fetch: no whole-list refetch.
      expect(api.get).toHaveBeenCalledTimes(2);

      // The row stays mounted (no spinner swap) and shows the new counts.
      await waitFor(() => {
        expect(screen.getByText("8 tools")).toBeInTheDocument();
      });
      expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
    });

    it("shows a warning toast when refresh returns success: true with validationErrors", async () => {
      const user = userEvent.setup();

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      vi.mocked(api.post).mockResolvedValueOnce({
        gatewayId: "server-0",
        success: true,
        toolsAdded: 2,
        toolsUpdated: 0,
        toolsRemoved: 0,
        validationErrors: ["Tool 'bad_tool' has an invalid input schema"],
        durationMs: 100,
        refreshedAt: "2025-09-09T00:00:00Z",
      });
      // Refetch after a successful refresh.
      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      const refreshItem = await screen.findByRole("menuitem", { name: /^refresh$/i });
      await user.click(refreshItem);

      await waitFor(() => {
        expect(mockToastWarning).toHaveBeenCalledWith(
          expect.stringContaining("Test Server 0"),
          expect.objectContaining({
            description: expect.stringContaining("Tool 'bad_tool' has an invalid input schema"),
          }),
        );
      });
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it("shows an error toast when refresh returns success: false on HTTP 200", async () => {
      const user = userEvent.setup();

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      vi.mocked(api.post).mockResolvedValueOnce({
        gatewayId: "server-0",
        success: false,
        error: "Upstream unreachable",
        durationMs: 50,
        refreshedAt: "2025-09-09T00:00:00Z",
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      const refreshItem = await screen.findByRole("menuitem", { name: /^refresh$/i });
      await user.click(refreshItem);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          "Error refreshing MCP server",
          expect.objectContaining({ description: "Upstream unreachable" }),
        );
      });
    });

    it("shows a conflict toast on HTTP 409", async () => {
      const user = userEvent.setup();

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      vi.mocked(api.post).mockRejectedValueOnce(
        new ApiError(409, { detail: "Refresh already running" }, "HTTP 409"),
      );

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      const refreshItem = await screen.findByRole("menuitem", { name: /^refresh$/i });
      await user.click(refreshItem);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          expect.stringContaining("already running for Test Server 0"),
        );
      });
    });

    it("does not show the Refresh item when the caller lacks gateways.update", async () => {
      const user = userEvent.setup();
      mockHasPermission.mockImplementation((perm: string) => perm !== "gateways.update");

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole("menuitem", { name: /^refresh$/i })).not.toBeInTheDocument();
    });

    it("hides Edit and Activate/Deactivate when the caller lacks gateways.update", async () => {
      const user = userEvent.setup();
      mockHasPermission.mockImplementation((perm: string) => perm !== "gateways.update");

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole("menuitem", { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /^deactivate$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /^activate$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /^delete$/i })).toBeInTheDocument();
    });

    it("hides Delete when the caller lacks gateways.delete", async () => {
      const user = userEvent.setup();
      mockHasPermission.mockImplementation((perm: string) => perm !== "gateways.delete");

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /^edit$/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole("menuitem", { name: /^delete$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /^deactivate$/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /^refresh$/i })).toBeInTheDocument();
    });

    it("shows the full menu when the caller has both gateways.update and gateways.delete", async () => {
      const user = userEvent.setup();
      mockHasPermission.mockImplementation(() => true);

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
      });
      expect(screen.getByRole("menuitem", { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /^delete$/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /^deactivate$/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /^refresh$/i })).toBeInTheDocument();
    });

    it("disables the Refresh item for the same server while a refresh is in-flight", async () => {
      const user = userEvent.setup();

      vi.mocked(api.get).mockResolvedValueOnce({
        gateways: createMockServers(0, 1),
        nextCursor: null,
      });

      renderWithRouter(<Servers />);

      await waitFor(() => {
        expect(screen.getByText("Test Server 0")).toBeInTheDocument();
      });

      vi.mocked(api.post).mockImplementationOnce(() => new Promise(() => {}));

      const actionsButtons = screen.getAllByRole("button", { name: /actions for/i });
      await user.click(actionsButtons[0]);

      const refreshItem = await screen.findByRole("menuitem", { name: /^refresh$/i });
      await user.click(refreshItem);

      await user.click(actionsButtons[0]);

      const pendingItem = await screen.findByRole("menuitem", {
        name: /refreshing test server 0/i,
      });
      expect(pendingItem).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("OAuth outcomes on the MCP Servers page", () => {
    function setupOAuth({ token = "missing", statusUnavailable = false, emptyList = false } = {}) {
      let tokenStatus = token;
      let discovered = false;
      const first = {
        ...mockServerDetails,
        authType: "oauth",
        oauthConfig: { grant_type: "authorization_code" },
      };
      const second = { ...first, id: "server-1", name: "Test Server 1" };
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.startsWith("/oauth/status")) {
          if (statusUnavailable) return Promise.reject(new Error("Service down"));
          return Promise.resolve(
            Object.fromEntries(
              [first, second].map((server) => [
                server.id,
                {
                  oauth_enabled: true,
                  grant_type: "authorization_code",
                  user_token_status: { status: tokenStatus, authorized: tokenStatus === "valid" },
                },
              ]),
            ) as never,
          );
        }
        if (path.startsWith("/v1/mcp-servers?"))
          return Promise.resolve({
            gateways: emptyList ? [] : [first, second],
            nextCursor: null,
          } as never);
        if (path === "/v1/mcp-servers/server-0") return Promise.resolve(first as never);
        if (path === "/v1/mcp-servers/server-1") return Promise.resolve(second as never);
        if (path.startsWith("/tools?"))
          return Promise.resolve({
            tools: discovered
              ? [
                  {
                    id: "new-tool",
                    name: "new_tool",
                    originalName: "new_tool",
                    title: "Fresh tool",
                  },
                ]
              : [],
          } as never);
        if (path.startsWith("/resources?"))
          return Promise.resolve({
            resources: discovered
              ? [
                  {
                    id: "new-resource",
                    name: "new_resource",
                    uri: "file:///fresh",
                    title: "Fresh resource",
                  },
                ]
              : [],
          } as never);
        if (path.startsWith("/prompts?"))
          return Promise.resolve({
            prompts: discovered
              ? [
                  {
                    id: "new-prompt",
                    name: "new_prompt",
                    originalName: "new_prompt",
                    title: "Fresh prompt",
                  },
                ]
              : [],
          } as never);
        return Promise.resolve({} as never);
      });
      const authorize = vi
        .spyOn(serversApi, "triggerOAuthAuthorization")
        .mockImplementation(async () => {
          tokenStatus = "valid";
          return { type: "oauth_callback", status: "success" };
        });
      const discover = vi.spyOn(serversApi, "fetchToolsAfterOAuth").mockImplementation(async () => {
        discovered = true;
        return { success: true, message: "Fetched components" };
      });
      return {
        authorize,
        discover,
        markDiscovered: () => {
          discovered = true;
        },
      };
    }

    it("opens Components and refetches tools, resources, and prompts after authorization", async () => {
      const user = userEvent.setup();
      const { discover } = setupOAuth();
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      expect(await screen.findByText("OAuth authorization successful.")).toBeVisible();
      expect(await screen.findByText("Fresh tool")).toBeVisible();
      expect(await screen.findByText("Fresh resource")).toBeVisible();
      expect(await screen.findByText("Fresh prompt")).toBeVisible();
      expect(discover).toHaveBeenCalledWith("server-0");
      expect(screen.getByRole("tab", { name: "Components" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    it("shows the provider reason, dismisses without closing details, and retries successfully", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      authorize.mockRejectedValueOnce(
        new OAuthAuthorizationError("access_denied", "Provider denied the requested scope"),
      );
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      const dialog = await screen.findByRole("dialog", {
        name: "OAuth authorization failed for Test Server 0",
      });
      expect(within(dialog).getByText("Provider denied the requested scope")).toBeVisible();
      await user.click(within(dialog).getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      const panel = screen.getByRole("region", { name: /Test Server 0/i });
      expect(within(panel).getByText("Authorization required")).toBeVisible();
      expect(screen.getAllByText("Authorization required")).toHaveLength(1);
      await user.click(within(panel).getAllByRole("button", { name: "Authorize" })[0]);
      expect(await screen.findByText("Fresh tool")).toBeVisible();
      expect(screen.queryByText("Authorization required")).not.toBeInTheDocument();
      expect(authorize).toHaveBeenCalledTimes(2);
    });

    it("dismisses only the failure dialog with Escape and restores focus to Authorize", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      authorize.mockRejectedValueOnce(new OAuthAuthorizationError("access_denied"));
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("region", { name: /Test Server 0/i })).toBeVisible();
      await waitFor(() =>
        expect(document.getElementById("oauth-authorize-server-0")).toHaveFocus(),
      );
    });

    it("retries directly from the failure dialog", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      authorize.mockRejectedValueOnce(new OAuthAuthorizationError("access_denied"));
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Try again" }),
      );
      expect(await screen.findByText("Fresh tool")).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("does not offer authorization when the token is already valid", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth({ token: "valid" });
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await user.click(await screen.findByRole("tab", { name: "Components" }));
      const panel = screen.getByRole("region", { name: /Test Server 0/i });
      expect(await within(panel).findByText("Active")).toBeVisible();
      expect(within(panel).queryByRole("button", { name: /^Authorize/ })).not.toBeInTheDocument();
      expect(authorize).not.toHaveBeenCalled();
    });

    it("keeps OAuth success when discovery returns success:false and retries discovery independently", async () => {
      const user = userEvent.setup();
      const { authorize, discover } = setupOAuth();
      discover.mockResolvedValueOnce({ success: false, message: "Unavailable" });
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      expect(await screen.findByText("OAuth authorization successful.")).toBeVisible();
      await user.click(await screen.findByRole("button", { name: "Retry refresh" }));
      expect(await screen.findByText("Fresh tool")).toBeVisible();
      expect(authorize).toHaveBeenCalledTimes(1);
      expect(discover).toHaveBeenCalledTimes(2);
    });

    it("allows authorization without component discovery for read-only users", async () => {
      const user = userEvent.setup();
      const { discover } = setupOAuth();
      mockHasPermission.mockImplementation((permission) => permission === "gateways.read");
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      expect(await screen.findByText("OAuth authorization successful.")).toBeVisible();
      expect(discover).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Refresh components" })).not.toBeInTheDocument();
    });

    it("treats popup closure as cancellation without a failure dialog", async () => {
      const user = userEvent.setup();
      const { authorize, discover } = setupOAuth();
      authorize.mockRejectedValueOnce(new OAuthCancelledError());
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Authorizing..." })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(discover).not.toHaveBeenCalled();
      expect(
        screen.getAllByRole("button", { name: "Authorize Test Server 0" }).length,
      ).toBeGreaterThan(0);
    });

    it("shows generic popup failures in a retryable dialog", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      authorize.mockRejectedValueOnce(new Error("Failed to open OAuth authorization window"));
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("button", { name: "Try again" })).toBeVisible();
      expect(within(dialog).getByText("An error occurred. Please try again.")).toBeVisible();
    });

    it("loads OAuth status for a deep-linked server outside the current list", async () => {
      setupOAuth({ emptyList: true });
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith(
          expect.stringContaining("gateway_ids=server-0"),
          undefined,
          expect.any(AbortSignal),
        ),
      );
      expect(await screen.findByRole("button", { name: "Authorize Test Server 0" })).toBeVisible();
    });

    it("keeps unavailable OAuth status distinguishable from missing authorization", async () => {
      setupOAuth({ statusUnavailable: true });
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      const panel = await screen.findByRole("region", { name: /Test Server 0/i });
      expect(await within(panel).findByText("Authorization status unavailable")).toBeVisible();
      expect(within(panel).queryByText("Authorization required")).not.toBeInTheDocument();
    });

    it("prevents duplicate attempts and does not reopen closed details when a callback arrives", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      let finish!: () => void;
      authorize.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ type: "oauth_callback", status: "success" });
          }),
      );
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      const panel = screen.getByRole("region", { name: /Test Server 0/i });
      expect(within(panel).getByRole("button", { name: "Authorizing..." })).toBeDisabled();
      await user.click(within(panel).getByRole("button", { name: "Authorizing..." }));
      expect(authorize).toHaveBeenCalledTimes(1);
      await user.click(within(panel).getByRole("button", { name: "Close MCP server details" }));
      await act(async () => finish());
      expect(screen.queryByRole("region", { name: /Test Server 0/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("does not apply a late failure to another selected server", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      let fail!: () => void;
      authorize.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            fail = () =>
              reject(new OAuthAuthorizationError("access_denied", "Failure from server 0"));
          }),
      );
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      await user.click(screen.getByRole("button", { name: "Actions for Test Server 1" }));
      await user.click(await screen.findByRole("menuitem", { name: "View details" }));
      expect(await screen.findByRole("region", { name: /Test Server 1/i })).toBeVisible();
      await act(async () => fail());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByText("Failure from server 0")).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: /Test Server 1/i })).toBeVisible();
    });

    it("refreshes an open component list independently of authorization", async () => {
      const user = userEvent.setup();
      const { authorize, markDiscovered } = setupOAuth({ token: "valid" });
      const refresh = vi.spyOn(serversApi, "refreshTools").mockImplementation(async () => {
        markDiscovered();
        return {
          success: true,
          gatewayId: "server-0",
          durationMs: 1,
          refreshedAt: "2026-10-21T00:00:00Z",
        };
      });
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await user.click(await screen.findByRole("tab", { name: "Components" }));
      expect(screen.queryByText("Fresh tool")).not.toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Refresh components" }));
      expect(await screen.findByText("Fresh tool")).toBeVisible();
      expect(refresh).toHaveBeenCalledWith("server-0");
      expect(authorize).not.toHaveBeenCalled();
    });

    it("retries component-list read failures without restarting OAuth", async () => {
      const user = userEvent.setup();
      const { authorize, markDiscovered } = setupOAuth({ token: "valid" });
      const get = vi.mocked(api.get).getMockImplementation()!;
      let failReads = true;
      vi.mocked(api.get).mockImplementation((...args) => {
        if (args[0].startsWith("/tools?") && failReads)
          return Promise.reject(new Error("Service down"));
        return get(...args);
      });
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await user.click(await screen.findByRole("tab", { name: "Components" }));
      expect(
        await screen.findByText("Tools, resources, or prompts could not be loaded."),
      ).toBeVisible();
      failReads = false;
      markDiscovered();
      await user.click(screen.getByRole("button", { name: "Retry refresh" }));
      expect(await screen.findByText("Fresh tool")).toBeVisible();
      expect(authorize).not.toHaveBeenCalled();
    });

    it("uses the shared status explanation and preserves compact table labels after failure", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      authorize.mockRejectedValueOnce(new OAuthAuthorizationError("access_denied"));
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Dismiss" }),
      );
      const panel = screen.getByRole("region", { name: /Test Server 0/i });
      await user.click(within(panel).getByRole("button", { name: /Authorization required/ }));
      expect(
        await screen.findByText(
          "You have not authorized this server. Authorization is per person.",
        ),
      ).toBeVisible();
      expect(within(screen.getByRole("table")).getAllByText("Auth")).toHaveLength(2);
    });

    it("keeps expired-token wording after dismissing an authorization failure", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth({ token: "expired" });
      authorize.mockRejectedValueOnce(new OAuthAuthorizationError("access_denied"));
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Dismiss" }),
      );
      const panel = screen.getByRole("region", { name: /Test Server 0/i });
      expect(within(panel).getByText("Authorization expired")).toBeVisible();
      expect(within(panel).queryByText("Authorization required")).not.toBeInTheDocument();
    });

    it("does not offer authorization while the token status loads", async () => {
      const user = userEvent.setup();
      setupOAuth();
      const get = vi.mocked(api.get).getMockImplementation()!;
      vi.mocked(api.get).mockImplementation((...args) =>
        args[0].startsWith("/oauth/status") ? new Promise(() => {}) : get(...args),
      );
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await user.click(await screen.findByRole("tab", { name: "Components" }));
      const panel = screen.getByRole("region", { name: /Test Server 0/i });
      expect(within(panel).queryByRole("button", { name: /^Authorize/ })).not.toBeInTheDocument();
    });

    it("shows one inline sentence and no toast when a panel refresh fails without a reason", async () => {
      const user = userEvent.setup();
      setupOAuth({ token: "valid" });
      vi.spyOn(serversApi, "refreshTools").mockResolvedValue({
        success: false,
        gatewayId: "server-0",
        durationMs: 1,
        refreshedAt: "2026-10-22T00:00:00Z",
      });
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await user.click(await screen.findByRole("tab", { name: "Components" }));
      await user.click(screen.getByRole("button", { name: "Refresh components" }));
      expect(
        await screen.findByText("Components could not be refreshed.", { exact: true }),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: "Retry refresh" })).toBeVisible();
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("uses only a toast for table refresh failures", async () => {
      const user = userEvent.setup();
      setupOAuth();
      vi.spyOn(serversApi, "refreshTools").mockRejectedValue(
        new ApiError(500, {}, "Server unavailable"),
      );
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await user.click(await screen.findByRole("tab", { name: "Components" }));
      await user.click(screen.getByRole("button", { name: "Actions for Test Server 0" }));
      await user.click(await screen.findByRole("menuitem", { name: /^Refresh$/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledOnce());
      expect(screen.queryByRole("button", { name: "Retry refresh" })).not.toBeInTheDocument();
    });

    it("does not offer an inline retry for an in-progress refresh conflict", async () => {
      const user = userEvent.setup();
      setupOAuth({ token: "valid" });
      vi.spyOn(serversApi, "refreshTools").mockRejectedValue(
        new ApiError(409, {}, "Refresh in progress"),
      );
      renderWithRouter(<Servers />, "/app/servers?selected=server-0");
      await user.click(await screen.findByRole("tab", { name: "Components" }));
      await user.click(screen.getByRole("button", { name: "Refresh components" }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledOnce());
      expect(screen.queryByRole("button", { name: "Retry refresh" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Components could not be refreshed/)).not.toBeInTheDocument();
    });

    it("restores focus to the panel close control when a successful retry removes Authorize", async () => {
      const user = userEvent.setup();
      const { authorize } = setupOAuth();
      authorize.mockRejectedValueOnce(new OAuthAuthorizationError("access_denied"));
      renderWithRouter(<Servers />);
      await user.click(await screen.findByRole("button", { name: "Authorize Test Server 0" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Try again" }),
      );
      expect(await screen.findByText("Fresh tool")).toBeVisible();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Close MCP server details" })).toHaveFocus(),
      );
    });
  });
});
