import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { I18nProvider } from "@/i18n";
import { RouterProvider } from "@/router";
import { ServerCatalog } from "./ServerCatalog";

vi.mock("@/hooks/useQuery", () => ({
  useQuery: vi.fn(),
}));

const mockUseQuery = vi.mocked(useQuery);

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

async function applyFilters(user: UserEvent) {
  const dialog = screen.getByRole("dialog", { name: "Add filters" });
  await user.click(within(dialog).getByRole("button", { name: "Add filters" }));
}

// Sections start in All mode; ticking an option requires switching to Select first.
async function selectSectionOption(user: UserEvent, section: string, option: string) {
  const fields = getFilterSection(section);
  const selectRadio = within(fields).getByRole("radio", { name: "Select..." });
  if (selectRadio.getAttribute("aria-checked") !== "true") {
    await user.click(selectRadio);
  }
  await user.click(within(getFilterSection(section)).getByRole("checkbox", { name: option }));
}

function renderWithRouter(ui: ReactElement, path = "/app/server-catalog") {
  window.history.pushState({}, "", path);
  return render(
    <RouterProvider>
      <I18nProvider>{ui}</I18nProvider>
    </RouterProvider>,
  );
}

describe("ServerCatalog", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/app/");
    mockUseQuery.mockReturnValue(queryResult());
  });

  it("uses the catalog GET endpoint and shared loader", () => {
    mockUseQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

    renderWithRouter(<ServerCatalog />);

    expect(mockUseQuery).toHaveBeenCalledWith("/v1/catalog?limit=1000");
    expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
  });

  it("renders only exact Open entries and marks registered servers connected", () => {
    renderWithRouter(<ServerCatalog />);

    expect(screen.getByRole("region", { name: "Server catalog" })).toBeInTheDocument();
    const catalogList = screen.getByRole("list", { name: "Catalog servers" });
    expect(within(catalogList).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
    expect(screen.queryByText("Secret Service")).not.toBeInTheDocument();
    expect(within(catalogList).getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 servers shown");
    expect(screen.getByRole("button", { name: "View Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Public Notes" })).toBeInTheDocument();
    expect(screen.queryByText(/registration coming soon/i)).not.toBeInTheDocument();
  });

  it("opens a read-only server details dialog", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    const viewButton = screen.getByRole("button", { name: "View Globalping" });
    await user.click(viewButton);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(within(dialog).getByText("jsDelivr")).toBeInTheDocument();
    expect(within(dialog).getByText("STREAMABLEHTTP")).toBeInTheDocument();
    expect(within(dialog).getByText("observability")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(viewButton).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "View Public Notes" }));
    expect(within(screen.getByRole("dialog")).getByText("Not connected")).toBeInTheDocument();
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
    expect(screen.getByRole("dialog", { name: "Add filters" })).toBeInTheDocument();

    await selectSectionOption(user, "Categories", "Productivity");
    expect(screen.queryByRole("checkbox", { name: "Security" })).not.toBeInTheDocument();

    await applyFilters(user);

    await waitFor(() => expect(window.location.search).toContain("category=Productivity"));
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Globalping" })).not.toBeInTheDocument();
  });

  it("leaves the URL and results untouched until filters are applied", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Categories", "Productivity");

    // The open modal marks the page behind it aria-hidden, so the grid has to be
    // queried with hidden: true while the draft is still uncommitted.
    expect(window.location.search).not.toContain("category");
    expect(screen.getByRole("heading", { name: "Globalping", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes", hidden: true })).toBeInTheDocument();
  });

  it("discards the draft when the dialog is cancelled or closed", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Categories", "Productivity");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(window.location.search).not.toContain("category");
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();

    await openFilters(user);
    await selectSectionOption(user, "Categories", "Productivity");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(window.location.search).not.toContain("category");
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
  });

  it("supports repeatable OR tag filters", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Tags", "network");
    await selectSectionOption(user, "Tags", "documents");
    await applyFilters(user);

    const params = new URLSearchParams(window.location.search);
    expect(params.getAll("tags")).toEqual(["network", "documents"]);
    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
  });

  it("does not offer provider or tag filters owned only by non-Open servers", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await user.click(within(getFilterSection("Tags")).getByRole("radio", { name: "Select..." }));
    expect(screen.queryByRole("checkbox", { name: "security" })).not.toBeInTheDocument();

    await user.click(
      within(getFilterSection("Providers")).getByRole("radio", { name: "Select..." }),
    );
    expect(screen.queryByRole("checkbox", { name: "SecureCo" })).not.toBeInTheDocument();
  });

  it("filters by several providers at once", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");
    await applyFilters(user);

    let params = new URLSearchParams(window.location.search);
    expect(params.getAll("provider")).toEqual(["jsDelivr"]);
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public Notes" })).not.toBeInTheDocument();

    await openFilters(user);
    await selectSectionOption(user, "Providers", "Example");
    await applyFilters(user);

    params = new URLSearchParams(window.location.search);
    expect(params.getAll("provider")).toEqual(["jsDelivr", "Example"]);
    expect(screen.getByRole("heading", { name: "Globalping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Notes" })).toBeInTheDocument();
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
      within(getFilterSection("Categories")).getByRole("checkbox", { name: "Monitoring" }),
    ).toBeChecked();
    expect(
      within(getFilterSection("Categories")).getByRole("checkbox", { name: "Productivity" }),
    ).toBeChecked();
    expect(
      within(getFilterSection("Providers")).getByRole("checkbox", { name: "jsDelivr" }),
    ).toBeChecked();
    expect(
      within(getFilterSection("Providers")).getByRole("checkbox", { name: "Example" }),
    ).not.toBeChecked();
  });

  it("clears only the section switched back to All", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />, "/app/server-catalog?provider=jsDelivr&tags=network");

    await openFilters(user);
    await user.click(within(getFilterSection("Providers")).getByRole("radio", { name: "All" }));
    await applyFilters(user);

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

  it("applies every filter section in a single history entry", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />);
    const replaceState = vi.spyOn(window.history, "replaceState");

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");
    await selectSectionOption(user, "Categories", "Monitoring");
    await selectSectionOption(user, "Tags", "network");
    expect(replaceState).not.toHaveBeenCalled();

    await applyFilters(user);
    expect(replaceState).toHaveBeenCalledTimes(1);

    replaceState.mockRestore();
  });

  it("drops a legacy auth_type param on any navigation", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ServerCatalog />, "/app/server-catalog?auth_type=Open");

    await openFilters(user);
    await selectSectionOption(user, "Providers", "jsDelivr");
    await applyFilters(user);

    expect(new URLSearchParams(window.location.search).has("auth_type")).toBe(false);

    renderWithRouter(<ServerCatalog />, "/app/server-catalog?auth_type=Open");
    await user.type(screen.getAllByRole("searchbox", { name: "Search MCP servers" })[0], "notes");

    await waitFor(() => expect(window.location.search).toContain("search=notes"));
    expect(new URLSearchParams(window.location.search).has("auth_type")).toBe(false);
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

  it("shows an empty state when the response has no Open entries", () => {
    mockUseQuery.mockReturnValue(
      queryResult({ data: { ...response, servers: [apiKeyServer], total: 1 } }),
    );

    renderWithRouter(<ServerCatalog />);

    expect(screen.getByText("No open MCP servers are available.")).toBeInTheDocument();
    expect(screen.queryByText("Secret Service")).not.toBeInTheDocument();
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
