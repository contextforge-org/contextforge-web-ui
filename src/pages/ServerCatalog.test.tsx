import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  disconnectCatalogGateway,
  getGatewayImpactPreview,
  registerCatalogServer,
  testCatalogServer,
} from "@/api/catalog";
import { ApiError } from "@/api/client";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { I18nProvider } from "@/i18n";
import { RouterProvider } from "@/router";
import { ServerCatalog } from "./ServerCatalog";

vi.mock("@/hooks/useQuery", () => ({
  useQuery: vi.fn(),
}));
const authState = vi.hoisted(() => ({
  hasPermission: vi.fn<(permission: string) => boolean>(() => true),
  permissionsLoading: false,
}));
vi.mock("@/auth/useAuth", () => ({
  useAuth: () => authState,
}));
vi.mock("@/hooks/useTeams", () => ({
  useTeamScope: () => ({ teams: [], onTeamChange: vi.fn() }),
}));
vi.mock("@/api/catalog", () => ({
  registerCatalogServer: vi.fn(),
  disconnectCatalogGateway: vi.fn(),
  getGatewayImpactPreview: vi.fn(),
  testCatalogServer: vi.fn(),
}));

const mockUseQuery = vi.mocked(useQuery);
const mockRegisterCatalogServer = vi.mocked(registerCatalogServer);
const mockDisconnectCatalogGateway = vi.mocked(disconnectCatalogGateway);
const mockGetGatewayImpactPreview = vi.mocked(getGatewayImpactPreview);
const mockTestCatalogServer = vi.mocked(testCatalogServer);

const openConnected: CatalogServer = {
  id: "open-connected",
  name: "Globalping",
  category: "Monitoring",
  url: "https://globalping.example/mcp",
  auth_type: "Open",
  provider: "jsDelivr",
  description: "Global network testing and monitoring",
  tags: ["network", "observability"],
  transport: "STREAMABLEHTTP",
  is_registered: true,
  gateway_id: "gateway-globalping",
};

const openAvailable: CatalogServer = {
  id: "open-available",
  name: "Public Notes",
  category: "Productivity",
  url: "https://notes.example/mcp",
  auth_type: "Open",
  provider: "Example",
  description: "Search public notes and documents",
  tags: ["search", "documents"],
  is_registered: false,
};

const apiKeyServer: CatalogServer = {
  id: "api-key",
  name: "Secret Service",
  category: "Security",
  url: "https://secret.example/mcp",
  auth_type: "API Key",
  provider: "SecureCo",
  description: "Requires a secret API key",
  tags: ["security"],
  is_registered: false,
};

const response: CatalogListResponse = {
  servers: [openConnected, openAvailable, apiKeyServer],
  total: 3,
  categories: ["Monitoring", "Productivity", "Security"],
  auth_types: ["API Key", "Open"],
  providers: ["Example", "jsDelivr", "SecureCo"],
  all_tags: ["documents", "network", "observability", "search", "security"],
};

function queryResult(overrides: Partial<ReturnType<typeof useQuery>> = {}) {
  return {
    data: response,
    error: null,
    isLoading: false,
    execute: vi.fn(),
    refetch: vi.fn(),
    setData: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useQuery>;
}

type UserEvent = ReturnType<typeof userEvent.setup>;

function getFilterSection(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

async function openFilters(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /^Filters(, \d+ active)?$/ }));
}

// Options are only on screen for the one expanded section that is also in Select
// mode. Clicking Select does both, so it is enough to press it whenever the
// option is not already rendered.
async function selectSectionOption(user: UserEvent, section: string, option: string) {
  if (!within(getFilterSection(section)).queryByRole("checkbox", { name: option })) {
    await user.click(within(getFilterSection(section)).getByRole("radio", { name: "Select" }));
  }
  await user.click(within(getFilterSection(section)).getByRole("checkbox", { name: option }));
}

function withProviders(ui: ReactElement) {
  return (
    <RouterProvider>
      <I18nProvider>{ui}</I18nProvider>
    </RouterProvider>
  );
}

function renderWithRouter(ui: ReactElement, path = "/app/server-catalog") {
  window.history.pushState({}, "", path);
  return render(withProviders(ui));
}

describe("ServerCatalog", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/app/");
    mockUseQuery.mockReturnValue(queryResult());
    mockRegisterCatalogServer.mockResolvedValue({
      success: true,
      server_id: "registered-server",
      message: "Registered",
    });
    authState.hasPermission.mockReturnValue(true);
    authState.permissionsLoading = false;
    mockDisconnectCatalogGateway.mockResolvedValue({
      status: 200,
      data: { status: "success" },
      headers: new Headers(),
    });
    mockGetGatewayImpactPreview.mockResolvedValue({ gatewayId: "gateway-globalping", servers: [] });
    mockTestCatalogServer.mockResolvedValue({ statusCode: 200, latencyMs: 12 });
  });

  it("uses the catalog GET endpoint and shared loader", () => {
    mockUseQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

    renderWithRouter(<ServerCatalog />);

    expect(mockUseQuery).toHaveBeenCalledWith("/v1/catalog?limit=1000");
    expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
  });

  it("keeps cached catalog data visible during refreshes and refresh failures", () => {
    let currentQueryResult = queryResult({ isLoading: true });
    mockUseQuery.mockImplementation(() => currentQueryResult);
    const { rerender } = renderWithRouter(<ServerCatalog />);

    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading..." })).not.toBeInTheDocument();

    currentQueryResult = queryResult({ error: { message: "refresh failed", status: 500 } });
    rerender(withProviders(<ServerCatalog />));

    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.queryByText("Unable to load server catalog. Try again.")).not.toBeInTheDocument();
  });

  it("renders supported Open and API-key entries and marks registered servers connected", () => {
    renderWithRouter(<ServerCatalog />);

    expect(screen.getByRole("region", { name: "Server catalog" })).toBeInTheDocument();
    const catalogList = screen.getByRole("list", { name: "Catalog servers" });
    expect(within(catalogList).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Secret Service" })).toBeInTheDocument();
    expect(within(catalogList).getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3 servers shown");
    expect(screen.getByRole("button", { name: "Actions for Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Public Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Secret Service" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Globalping" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Public Notes" })).toBeInTheDocument();
    expect(screen.queryByText(/registration coming soon/i)).not.toBeInTheDocument();
  });

  it("offers API auth entries through the API-key add flow", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(
      queryResult({
        data: {
          ...response,
          servers: [{ ...apiKeyServer, id: "api", name: "API Service", auth_type: "API" }],
          total: 1,
        },
      }),
    );
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Add API Service" }));
    expect(await screen.findByRole("dialog", { name: "Add API Service" })).toBeInTheDocument();
  });

  it("opens a read-only server details dialog", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    const actionsButton = screen.getByRole("button", { name: "Actions for Globalping" });
    await user.click(actionsButton);
    await user.click(screen.getByRole("menuitem", { name: "View details" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(within(dialog).getByText("jsDelivr")).toBeInTheDocument();
    expect(within(dialog).getByText("STREAMABLEHTTP")).toBeInTheDocument();
    expect(within(dialog).getByText("observability")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(actionsButton).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Add Public Notes" }));
    expect(mockRegisterCatalogServer).toHaveBeenCalledWith("open-available");
  });

  it("tests a connected catalog server and reports status plus latency", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Test connection" }));

    await waitFor(() =>
      expect(mockTestCatalogServer).toHaveBeenCalledWith("https://globalping.example/mcp"),
    );
    expect(
      await screen.findByText("Globalping connection succeeded with status 200 in 12 ms."),
    ).toBeVisible();
  });

  it("reports a failed connection distinctly from a successful connection", async () => {
    const user = userEvent.setup();
    mockTestCatalogServer.mockResolvedValue({ statusCode: 503, latencyMs: 12 });
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Test connection" }));

    expect(
      await screen.findByText("Globalping connection failed with status 503 in 12 ms."),
    ).toBeVisible();
  });

  it("reports an empty connectivity response as a test error", async () => {
    const user = userEvent.setup();
    mockTestCatalogServer.mockResolvedValue(null);
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Test connection" }));

    expect(await screen.findByText("Unable to test Globalping. Try again.")).toBeVisible();
    expect(screen.queryByText(/status 0/i)).not.toBeInTheDocument();
  });

  it("keeps notifications from independent server mutations", async () => {
    const user = userEvent.setup();
    mockTestCatalogServer.mockResolvedValue({ statusCode: 503, latencyMs: 12 });
    mockRegisterCatalogServer.mockRejectedValue(new Error("Network error"));
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Test connection" }));
    await screen.findByText("Globalping connection failed with status 503 in 12 ms.");

    await user.click(screen.getByRole("button", { name: "Add Public Notes" }));
    expect(await screen.findByText("Unable to add this server. Try again.")).toBeVisible();
    expect(
      screen.getByText("Globalping connection failed with status 503 in 12 ms."),
    ).toBeVisible();
  });

  it("disables Test when OAuth configuration remains incomplete", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(
      queryResult({
        data: {
          ...response,
          servers: [{ ...openConnected, requires_oauth_config: true }],
          total: 1,
        },
      }),
    );
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));

    expect(screen.getByRole("menuitem", { name: "Test connection" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("hides connected-server mutations without their permissions", async () => {
    const user = userEvent.setup();
    authState.hasPermission.mockReturnValue(false);
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));

    expect(screen.queryByRole("menuitem", { name: "Test connection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Disconnect" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View details" })).toBeInTheDocument();
  });

  it("loads disconnect impact for a caller allowed to delete but not test", async () => {
    const user = userEvent.setup();
    authState.hasPermission.mockImplementation((permission) => permission === "gateways.delete");
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    expect(screen.queryByRole("menuitem", { name: "Test connection" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));

    await waitFor(() =>
      expect(mockGetGatewayImpactPreview).toHaveBeenCalledWith("gateway-globalping"),
    );
  });

  it("confirms disconnect, shows affected virtual servers, then refetches catalog", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(response);
    mockUseQuery.mockReturnValue(queryResult({ refetch }));
    mockGetGatewayImpactPreview.mockResolvedValue({
      gatewayId: "gateway-globalping",
      servers: [{ id: "virtual-1", name: "Production assistant" }],
    });
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Production assistant")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    await waitFor(() =>
      expect(mockDisconnectCatalogGateway).toHaveBeenCalledWith("gateway-globalping"),
    );
    expect(refetch).toHaveBeenCalledOnce();
    expect(await screen.findByText("Globalping disconnected.")).toBeInTheDocument();
  });

  it("announces impact-preview loading to screen readers", async () => {
    const user = userEvent.setup();
    let resolvePreview: (preview: { gatewayId: string; servers: never[] }) => void;
    mockGetGatewayImpactPreview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));

    const impactAnnouncement = screen.getByText("Checking affected virtual servers…", {
      selector: "[aria-live]",
    });
    expect(impactAnnouncement).toHaveAttribute("aria-live", "polite");
    expect(impactAnnouncement).toHaveAttribute("aria-atomic", "true");
    resolvePreview!({ gatewayId: "gateway-globalping", servers: [] });
  });

  it("distinguishes an empty impact preview from a failed preview", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    expect(await screen.findByText("No affected virtual servers found.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    mockGetGatewayImpactPreview.mockRejectedValue(new Error("Preview unavailable"));
    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));

    expect(
      await screen.findByText(
        "Could not check affected virtual servers. You can still disconnect this server.",
      ),
    ).toBeVisible();
  });

  it("waits for catalog state after an async disconnect", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      ...response,
      servers: [{ ...openConnected, is_registered: false, gateway_id: null }],
    });
    mockUseQuery.mockReturnValue(queryResult({ refetch }));
    mockDisconnectCatalogGateway.mockResolvedValue({
      status: 202,
      data: { status: "deleting" },
      headers: new Headers({ "Retry-After": "0.001" }),
    });
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(refetch).toHaveBeenCalledOnce(), { timeout: 1_000 });
    expect(await screen.findByText("Globalping disconnected.")).toBeInTheDocument();
  });

  it("closes an accepted async disconnect and marks the card as disconnecting", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn(() => new Promise<CatalogListResponse>(() => {}));
    mockUseQuery.mockReturnValue(queryResult({ refetch }));
    mockDisconnectCatalogGateway.mockResolvedValue({
      status: 202,
      data: { status: "deleting" },
      headers: new Headers({ "Retry-After": "0.001" }),
    });
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const acceptedNotification = await screen.findByText("Globalping is disconnecting.");
    expect(acceptedNotification.closest('[role="status"]')).toBeVisible();
    expect(screen.getByText("Disconnecting…")).toHaveAttribute("role", "status");
  });

  it("retries async disconnect status without sending DELETE again", async () => {
    const user = userEvent.setup();
    const refetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary catalog failure"))
      .mockResolvedValue(response);
    mockUseQuery.mockReturnValue(queryResult({ refetch }));
    mockDisconnectCatalogGateway.mockClear();
    mockDisconnectCatalogGateway.mockResolvedValue({
      status: 202,
      data: { status: "deleting" },
      headers: new Headers({ "Retry-After": "0.001" }),
    });

    renderWithRouter(<ServerCatalog />);
    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog");

    vi.useFakeTimers();
    try {
      fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(
        screen.getByText("Globalping is still disconnecting. You can retry shortly."),
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(
        screen.getByText("Globalping is still disconnecting. You can retry shortly."),
      ).toBeVisible();
      refetch.mockResolvedValue({
        ...response,
        servers: [{ ...openConnected, is_registered: false, gateway_id: null }],
      });
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(screen.getByText("Globalping disconnected.")).toBeVisible();
      expect(mockDisconnectCatalogGateway).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports persistent catalog polling failures as errors", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockRejectedValue(new ApiError(500, null, "HTTP 500"));
    mockUseQuery.mockReturnValue(queryResult({ refetch }));
    mockDisconnectCatalogGateway.mockResolvedValue({
      status: 202,
      data: { status: "deleting" },
      headers: new Headers({ "Retry-After": "0.001" }),
    });
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog");

    vi.useFakeTimers();
    try {
      fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(screen.getByText("Unable to disconnect Globalping. Try again.")).toBeVisible();
      expect(refetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps catalog state unchanged when backend rejects disconnect ownership", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockUseQuery.mockReturnValue(queryResult({ refetch }));
    mockDisconnectCatalogGateway.mockRejectedValue(
      new ApiError(403, { detail: "Only the owner can delete this gateway" }, "HTTP 403"),
    );
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Actions for Globalping" }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    expect(await screen.findByText("Unable to disconnect Globalping. Try again.")).toBeVisible();
    expect(refetch).not.toHaveBeenCalled();
    expect(screen.getAllByText("Connected")).toHaveLength(2);
  });

  it("reports catalog registration failures", async () => {
    const user = userEvent.setup();
    mockRegisterCatalogServer.mockRejectedValue(new Error("network detail must not leak"));
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Add Public Notes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to add this server. Try again.",
    );
    expect(screen.queryByText(/network detail/i)).not.toBeInTheDocument();
  });

  it("registers an available server then refetches authoritative gateway state", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const setData = vi.fn();
    mockUseQuery.mockReturnValue(queryResult({ refetch, setData }));
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Add Public Notes" }));

    await waitFor(() => expect(mockRegisterCatalogServer).toHaveBeenCalledWith("open-available"));
    expect(setData).toHaveBeenCalledOnce();
    const updateCatalog = setData.mock.calls[0][0] as (
      current: CatalogListResponse | undefined,
    ) => CatalogListResponse | undefined;
    expect(
      updateCatalog(response)?.servers.find((server) => server.id === openAvailable.id),
    ).toMatchObject({ is_registered: true, gateway_id: "registered-server" });
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("opens an API-key dialog and submits catalog registration fields", async () => {
    const user = userEvent.setup();
    const setData = vi.fn();
    mockUseQuery.mockReturnValue(queryResult({ setData }));
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Add Secret Service" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Secret Service" });
    await user.type(within(dialog).getByLabelText("Custom name (optional)"), "My Secret Service");
    await user.type(within(dialog).getByLabelText(/^API key/), "test-api-key"); // pragma: allowlist secret
    await user.click(within(dialog).getByRole("button", { name: "Add server" }));

    await waitFor(() =>
      expect(mockRegisterCatalogServer).toHaveBeenCalledWith("api-key", {
        name: "My Secret Service",
        api_key: "test-api-key",
        visibility: "private",
        team_id: null,
      }),
    );
    expect(setData).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Add Secret Service" })).not.toBeInTheDocument();
  });

  it("requires an API key before registration", async () => {
    const user = userEvent.setup();
    const registrationCallCount = mockRegisterCatalogServer.mock.calls.length;
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Add Secret Service" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Secret Service" });
    await user.click(within(dialog).getByRole("button", { name: "Add server" }));

    expect(await within(dialog).findByText("API key is required.")).toBeInTheDocument();
    expect(mockRegisterCatalogServer).toHaveBeenCalledTimes(registrationCallCount);
  });

  it("refetches an already-registered response to obtain its gateway ID", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const setData = vi.fn();
    mockUseQuery.mockReturnValue(queryResult({ refetch, setData }));
    mockRegisterCatalogServer.mockRejectedValue(
      new ApiError(409, { detail: "Server already registered" }, "HTTP 409"),
    );
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Add Public Notes" }));

    expect(await screen.findByText("Public Notes is already connected.")).toBeInTheDocument();
    expect(setData).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Server already registered")).not.toBeInTheDocument();
  });

  it("removes a stale catalog entry after a registration 404 and refreshes", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const setData = vi.fn();
    mockUseQuery.mockReturnValue(queryResult({ refetch, setData }));
    mockRegisterCatalogServer.mockRejectedValue(
      new ApiError(404, { detail: "Catalog server not found" }, "HTTP 404"),
    );
    renderWithRouter(<ServerCatalog />);

    await user.click(screen.getByRole("button", { name: "Add Public Notes" }));

    const notification = await screen.findByRole("alert");
    expect(notification).toHaveTextContent("Public Notes is no longer available in the catalog.");
    await waitFor(() => expect(notification).toHaveFocus());
    expect(setData).toHaveBeenCalledOnce();
    const updateCatalog = setData.mock.calls[0][0] as (
      current: CatalogListResponse | undefined,
    ) => CatalogListResponse | undefined;
    expect(updateCatalog(response)?.servers).not.toContainEqual(openAvailable);
    expect(updateCatalog(response)?.total).toBe(2);
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Catalog server not found")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Server catalog" })).toHaveFocus(),
    );
  });

  it("tracks concurrent registrations independently", async () => {
    const user = userEvent.setup();
    const secondAvailable = {
      ...openAvailable,
      id: "open-weather",
      name: "Public Weather",
    };
    let resolveNotes!: (value: Awaited<ReturnType<typeof registerCatalogServer>>) => void;
    let resolveWeather!: (value: Awaited<ReturnType<typeof registerCatalogServer>>) => void;
    mockRegisterCatalogServer.mockImplementation(
      (id) =>
        new Promise((resolve) => {
          if (id === openAvailable.id) resolveNotes = resolve;
          if (id === secondAvailable.id) resolveWeather = resolve;
        }),
    );
    const refetch = vi.fn();
    const setData = vi.fn();
    mockUseQuery.mockReturnValue(
      queryResult({
        data: { ...response, servers: [openAvailable, secondAvailable], total: 2 },
        refetch,
        setData,
      }),
    );
    renderWithRouter(<ServerCatalog />);

    const notesCard = screen.getByRole("heading", { name: "Public Notes" }).closest("article")!;
    const weatherCard = screen.getByRole("heading", { name: "Public Weather" }).closest("article")!;
    await user.click(within(notesCard).getByRole("button", { name: "Add Public Notes" }));
    await user.click(within(weatherCard).getByRole("button", { name: "Add Public Weather" }));

    expect(within(notesCard).getByRole("button", { name: "Adding Public Notes…" })).toBeDisabled();
    expect(
      within(weatherCard).getByRole("button", { name: "Adding Public Weather…" }),
    ).toBeDisabled();

    resolveWeather({ success: true, server_id: "weather", message: "Registered" });
    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    expect(within(notesCard).getByRole("button", { name: "Adding Public Notes…" })).toBeDisabled();

    resolveNotes({ success: true, server_id: "notes", message: "Registered" });
    await waitFor(() => expect(setData).toHaveBeenCalledTimes(2));
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("shows connected status in details opened from the action menu", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(
      queryResult({ data: { ...response, servers: [{ ...openAvailable, is_registered: true }] } }),
    );
    renderWithRouter(<ServerCatalog />);

    const actionsButton = screen.getByRole("button", { name: "Actions for Public Notes" });
    await user.click(actionsButton);
    await user.click(screen.getByRole("menuitem", { name: "View details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Connected")).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("renders safe remote logos and falls back when loading fails", () => {
    const logoUrl = "https://cdn.example/globalping.svg";
    mockUseQuery.mockReturnValue(
      queryResult({
        data: {
          ...response,
          servers: [{ ...openConnected, logo_url: logoUrl }],
          total: 1,
        },
      }),
    );

    const { container } = renderWithRouter(<ServerCatalog />);
    const logo = container.querySelector(`img[src="${logoUrl}"]`);

    expect(logo).toBeInTheDocument();
    fireEvent.error(logo!);
    expect(container.querySelector(`img[src="${logoUrl}"]`)).not.toBeInTheDocument();
    expect(container.querySelector('[aria-label="Globalping icon"]')).toBeInTheDocument();
  });

  it("rejects non-HTTPS catalog logos", () => {
    mockUseQuery.mockReturnValue(
      queryResult({
        data: {
          ...response,
          servers: [{ ...openConnected, logo_url: "http://tracking.example/logo.svg" }],
          total: 1,
        },
      }),
    );

    const { container } = renderWithRouter(<ServerCatalog />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector('[aria-label="Globalping icon"]')).toBeInTheDocument();
  });

  it("uses a labelled pressed-button group for catalog views", () => {
    renderWithRouter(<ServerCatalog />);

    const viewOptions = screen.getByRole("group", { name: "Catalog view" });
    expect(within(viewOptions).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(viewOptions).getByRole("button", { name: "Connected" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("restores search and installed state from the URL", () => {
    renderWithRouter(
      <ServerCatalog />,
      "/app/server-catalog?search=global&show_registered_only=true",
    );

    expect(screen.getByRole("button", { name: "Connected" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("searchbox", { name: "Search MCP servers" })).toHaveValue("global");
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public Notes" })).not.toBeInTheDocument();
  });

  it("updates URL state for search and tabs", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    await user.type(screen.getByRole("searchbox", { name: "Search MCP servers" }), "notes");
    expect(replaceState).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Globalping" })).not.toBeInTheDocument();

    await waitFor(() => expect(window.location.search).toContain("search=notes"));
    expect(replaceState).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Connected" }));
    expect(window.location.search).toContain("show_registered_only=true");
    expect(
      screen.getByText("No MCP servers match the active search and filters."),
    ).toBeInTheDocument();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalled();

    pushState.mockRestore();
    replaceState.mockRestore();
  });

  it("filters by category and reflects it in the URL", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();

    await selectSectionOption(user, "Categories", "Productivity");
    expect(screen.getByRole("checkbox", { name: "Security" })).toBeInTheDocument();

    await waitFor(() => expect(window.location.search).toContain("category=Productivity"));
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Globalping" })).not.toBeInTheDocument();
  });

  it("opens with Providers expanded and the other sections on All", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);

    const providers = getFilterSection("Providers");
    expect(within(providers).getByRole("radio", { name: "Select" })).toBeChecked();
    expect(within(providers).getByRole("checkbox", { name: "jsDelivr" })).toBeInTheDocument();

    const categories = getFilterSection("Categories");
    expect(within(categories).getByRole("radio", { name: "All" })).toBeChecked();
    expect(within(categories).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("still shows Providers on All after reopening the popover", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");

    // All drops the provider filter, so what it commits is indistinguishable
    // from never having chosen: only the section's own mode remembers.
    await user.click(within(getFilterSection("Providers")).getByRole("radio", { name: "All" }));
    await waitFor(() => expect(window.location.search).not.toContain("provider="));

    await user.keyboard("{Escape}");
    await openFilters(user);

    const providers = getFilterSection("Providers");
    expect(within(providers).getByRole("radio", { name: "All" })).toBeChecked();
    expect(within(providers).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps the popover open and the grid live while options are ticked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Categories", "Productivity");

    // A non-modal popover leaves the grid behind it visible, so the filtered
    // results are queryable straight away.
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Globalping" })).not.toBeInTheDocument();
  });

  it("drops every section at once with Clear all", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <ServerCatalog />,
      "/app/server-catalog?provider=jsDelivr&tags=network&category=Monitoring&search=ping",
    );

    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    const params = new URLSearchParams(window.location.search);
    expect(params.has("provider")).toBe(false);
    expect(params.has("tags")).toBe(false);
    expect(params.has("category")).toBe(false);
    // Search sits outside the popover, so Clear all leaves it alone.
    expect(params.get("search")).toBe("ping");
    expect(screen.getByRole("button", { name: /^Filters$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });

  it("hides Clear all until a section filter is set", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();

    await selectSectionOption(user, "Providers", "jsDelivr");
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
  });

  it("expands one section at a time and reopens a collapsed one on Select", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");

    // Opening Categories collapses Providers down to its Select row and count.
    await user.click(within(getFilterSection("Categories")).getByRole("radio", { name: "Select" }));
    const providers = getFilterSection("Providers");
    expect(within(providers).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(providers).getByRole("radio", { name: "Select" })).toBeChecked();
    expect(
      within(getFilterSection("Categories")).getByRole("checkbox", { name: "Productivity" }),
    ).toBeInTheDocument();

    // Clicking the already-checked Select radio reopens the collapsed section.
    await user.click(within(getFilterSection("Providers")).getByRole("radio", { name: "Select" }));
    expect(
      within(getFilterSection("Providers")).getByRole("checkbox", { name: "jsDelivr" }),
    ).toBeChecked();
    expect(within(getFilterSection("Categories")).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("announces how many options a collapsed section has selected", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");
    await selectSectionOption(user, "Providers", "Example");

    // Collapse Providers by expanding another section: its count badge is the
    // only thing left on screen saying it is filtered.
    await user.click(within(getFilterSection("Categories")).getByRole("radio", { name: "Select" }));
    const select = within(getFilterSection("Providers")).getByRole("radio", { name: "Select" });
    expect(select).toHaveAccessibleDescription("2 selected");
  });

  it("supports repeatable OR tag filters", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Tags", "network");
    await selectSectionOption(user, "Tags", "documents");

    const params = new URLSearchParams(window.location.search);
    expect(params.getAll("tags")).toEqual(["network", "documents"]);
    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
  });

  it("offers filters owned by API-key catalog servers", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    // Providers opens expanded, so its options are on screen straight away.
    expect(screen.getByRole("checkbox", { name: "SecureCo" })).toBeInTheDocument();

    await user.click(within(getFilterSection("Tags")).getByRole("radio", { name: "Select" }));
    expect(screen.getByRole("checkbox", { name: "security" })).toBeInTheDocument();
  });

  it("filters by several providers at once", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");

    let params = new URLSearchParams(window.location.search);
    expect(params.getAll("provider")).toEqual(["jsDelivr"]);
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public Notes" })).not.toBeInTheDocument();

    await selectSectionOption(user, "Providers", "Example");

    params = new URLSearchParams(window.location.search);
    expect(params.getAll("provider")).toEqual(["jsDelivr", "Example"]);
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
  });

  it("filters by authentication type and reflects it in the URL", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Authentication", "API Key");

    expect(
      within(getFilterSection("Authentication")).getByRole("checkbox", { name: "Open" }),
    ).toBeInTheDocument();
    expect(
      within(getFilterSection("Authentication")).getByRole("checkbox", { name: "API Key" }),
    ).toBeChecked();
    expect(
      within(getFilterSection("Authentication")).getByRole("checkbox", { name: "API" }),
    ).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).getAll("auth_type")).toEqual(["API Key"]);
    expect(screen.getByRole("heading", { name: "Secret Service" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Globalping" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public Notes" })).not.toBeInTheDocument();
  });

  it("restores repeated category and provider params from the URL", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <ServerCatalog />,
      "/app/server-catalog?category=Monitoring&category=Productivity&provider=jsDelivr",
    );

    expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public Notes" })).not.toBeInTheDocument();

    await openFilters(user);
    expect(
      within(getFilterSection("Providers")).getByRole("checkbox", { name: "jsDelivr" }),
    ).toBeChecked();
    expect(
      within(getFilterSection("Providers")).getByRole("checkbox", { name: "Example" }),
    ).not.toBeChecked();

    // Categories restores its selections too, but only once expanded: the panel
    // shows one section's options at a time.
    await user.click(within(getFilterSection("Categories")).getByRole("radio", { name: "Select" }));
    expect(
      within(getFilterSection("Categories")).getByRole("checkbox", { name: "Monitoring" }),
    ).toBeChecked();
    expect(
      within(getFilterSection("Categories")).getByRole("checkbox", { name: "Productivity" }),
    ).toBeChecked();
  });

  it("clears only the section switched back to All", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />, "/app/server-catalog?provider=jsDelivr&tags=network");

    await openFilters(user);
    await user.click(within(getFilterSection("Providers")).getByRole("radio", { name: "All" }));

    const params = new URLSearchParams(window.location.search);
    expect(params.has("provider")).toBe(false);
    expect(params.getAll("tags")).toEqual(["network"]);
    expect(screen.getByRole("button", { name: "Filters, 1 active" })).toBeInTheDocument();
  });

  it("shows no active filter count on a fresh page", () => {
    renderWithRouter(<ServerCatalog />);

    expect(screen.getByRole("button", { name: /^Filters$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Filters, \d+ active/ })).not.toBeInTheDocument();
  });

  it("commits each section as it is ticked, without adding history entries", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");
    await selectSectionOption(user, "Categories", "Monitoring");
    await selectSectionOption(user, "Authentication", "Open");
    await selectSectionOption(user, "Tags", "network");

    expect(replaceState).toHaveBeenCalledTimes(4);
    expect(pushState).not.toHaveBeenCalled();

    const params = new URLSearchParams(window.location.search);
    expect(params.getAll("provider")).toEqual(["jsDelivr"]);
    expect(params.getAll("category")).toEqual(["Monitoring"]);
    expect(params.getAll("auth_type")).toEqual(["Open"]);
    expect(params.getAll("tags")).toEqual(["network"]);

    pushState.mockRestore();
    replaceState.mockRestore();
  });

  it("restores auth-type filters from the URL and preserves them on navigation", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />, "/app/server-catalog?auth_type=API+Key");

    await openFilters(user);
    await user.click(
      within(getFilterSection("Authentication")).getByRole("radio", { name: "Select" }),
    );

    expect(
      within(getFilterSection("Authentication")).getByRole("checkbox", { name: "API Key" }),
    ).toBeChecked();
    expect(screen.getByRole("heading", { name: "Secret Service" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public Notes" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search MCP servers" }), "secret");

    await waitFor(() => expect(window.location.search).toContain("search=secret"));
    expect(new URLSearchParams(window.location.search).getAll("auth_type")).toEqual(["API Key"]);
  });

  it("shows explicit disabled and generic error states with retry", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(
      queryResult({ data: undefined, error: { message: "HTTP 404", status: 404 } }),
    );
    const { unmount } = renderWithRouter(<ServerCatalog />);

    expect(screen.getByText("Server catalog is disabled for this gateway.")).toBeInTheDocument();

    unmount();
    const refetch = vi.fn().mockResolvedValue(response);
    mockUseQuery.mockReturnValue(
      queryResult({ data: undefined, error: { message: "HTTP 500", status: 500 }, refetch }),
    );
    renderWithRouter(<ServerCatalog />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load server catalog. Try again.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows API-key catalog entries", () => {
    mockUseQuery.mockReturnValue(
      queryResult({ data: { ...response, servers: [apiKeyServer], total: 1 } }),
    );

    renderWithRouter(<ServerCatalog />);

    expect(screen.getByRole("heading", { name: "Secret Service" })).toBeInTheDocument();
  });

  it("shows a dedicated empty state when no Open servers are connected", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(
      queryResult({ data: { ...response, servers: [openAvailable, apiKeyServer], total: 2 } }),
    );

    renderWithRouter(<ServerCatalog />);
    await user.click(screen.getByRole("button", { name: "Connected" }));

    expect(screen.getByText("No MCP server catalog options are connected.")).toBeInTheDocument();
    expect(
      screen.queryByText("No MCP servers match the active search and filters."),
    ).not.toBeInTheDocument();
  });
});
