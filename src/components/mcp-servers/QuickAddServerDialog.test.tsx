import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { registerCatalogServer } from "@/api/catalog";
import { ApiError } from "@/api/client";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { renderWithProviders } from "@/test/test-utils";
import { QUICK_ADD_CATALOG_IDS } from "@/config/quickAddServers";
import { QuickAddServerDialog } from "./QuickAddServerDialog";

vi.mock("@/hooks/useQuery", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/api/catalog", () => ({
  registerCatalogServer: vi.fn(),
}));

const mockUseQuery = vi.mocked(useQuery);
const mockRegister = vi.mocked(registerCatalogServer);

function catalogServer(
  overrides: Partial<CatalogServer> & Pick<CatalogServer, "id">,
): CatalogServer {
  return {
    name: overrides.id,
    category: "Documentation",
    url: `https://${overrides.id}.example/mcp`,
    auth_type: "Open",
    provider: overrides.id,
    description: `${overrides.id} description`,
    ...overrides,
  };
}

// Only the first two curated ids, plus one non-curated id that must be filtered out.
const catalogResponse: CatalogListResponse = {
  servers: [
    catalogServer({ id: QUICK_ADD_CATALOG_IDS[0] }),
    catalogServer({ id: QUICK_ADD_CATALOG_IDS[1] }),
    catalogServer({ id: "not-curated" }),
  ],
  total: 3,
  categories: [],
  auth_types: [],
  providers: [],
};

// A curated id whose catalog entry has since drifted off the Quick Add contract:
// non-Open auth and/or an unsupported transport must still be excluded.
function catalogResponseWith(overrides: Partial<CatalogServer>): CatalogListResponse {
  return {
    servers: [
      catalogServer({ id: QUICK_ADD_CATALOG_IDS[0], ...overrides }),
      catalogServer({ id: QUICK_ADD_CATALOG_IDS[1] }),
    ],
    total: 2,
    categories: [],
    auth_types: [],
    providers: [],
  };
}

function mockCatalogQuery(overrides: Partial<ReturnType<typeof useQuery>> = {}) {
  mockUseQuery.mockReturnValue({
    data: catalogResponse,
    error: null,
    isLoading: false,
    execute: vi.fn(),
    refetch: vi.fn(),
    setData: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useQuery>);
}

function selectFirstCuratedCard(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("radio", { name: new RegExp(QUICK_ADD_CATALOG_IDS[0]) }));
}

describe("QuickAddServerDialog", () => {
  beforeEach(() => {
    mockRegister.mockReset();
  });

  it("renders only the curated catalog entries", () => {
    mockCatalogQuery();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.getByText(QUICK_ADD_CATALOG_IDS[0])).toBeInTheDocument();
    expect(screen.getByText(QUICK_ADD_CATALOG_IDS[1])).toBeInTheDocument();
    expect(screen.queryByText("not-curated")).not.toBeInTheDocument();
  });

  it("excludes a curated entry that is no longer Open auth", () => {
    mockCatalogQuery({ data: catalogResponseWith({ auth_type: "oauth" }) });
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.queryByText(QUICK_ADD_CATALOG_IDS[0])).not.toBeInTheDocument();
    expect(screen.getByText(QUICK_ADD_CATALOG_IDS[1])).toBeInTheDocument();
  });

  it("excludes a curated entry with an unsupported transport", () => {
    mockCatalogQuery({ data: catalogResponseWith({ transport: "WEBSOCKET" }) });
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.queryByText(QUICK_ADD_CATALOG_IDS[0])).not.toBeInTheDocument();
    expect(screen.getByText(QUICK_ADD_CATALOG_IDS[1])).toBeInTheDocument();
  });

  it("disables Continue until a card is selected, then registers and reports the new gateway id", async () => {
    mockCatalogQuery();
    mockRegister.mockResolvedValue({
      success: true,
      server_id: "gateway-1",
      message: "registered",
    });
    const user = userEvent.setup();
    const onConnected = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={onConnected}
        onBrowseCatalog={vi.fn()}
      />,
    );

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    await selectFirstCuratedCard(user);
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);

    expect(mockRegister).toHaveBeenCalledWith(QUICK_ADD_CATALOG_IDS[0]);
    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith("gateway-1", QUICK_ADD_CATALOG_IDS[0]);
    });
  });

  it("skips registration when the picked entry is already connected", async () => {
    mockCatalogQuery({
      data: catalogResponseWith({ is_registered: true, gateway_id: "existing-gateway" }),
    });
    const user = userEvent.setup();
    const onConnected = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={onConnected}
        onBrowseCatalog={vi.fn()}
      />,
    );

    await selectFirstCuratedCard(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(mockRegister).not.toHaveBeenCalled();
    expect(onConnected).toHaveBeenCalledWith("existing-gateway", QUICK_ADD_CATALOG_IDS[0]);
  });

  it("keeps the dialog open and shows the failure when registration fails", async () => {
    mockCatalogQuery();
    mockRegister.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    const onConnected = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={onConnected}
        onBrowseCatalog={vi.fn()}
      />,
    );

    await selectFirstCuratedCard(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Unable to connect this server. Try again."),
    ).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("points at the catalog when registration 409s on an entry the loaded list still shows as new", async () => {
    mockCatalogQuery();
    mockRegister.mockRejectedValue(new ApiError(409, null, "conflict"));
    const user = userEvent.setup();
    const onConnected = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={onConnected}
        onBrowseCatalog={vi.fn()}
      />,
    );

    await selectFirstCuratedCard(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText(
        `${QUICK_ADD_CATALOG_IDS[0]} is already connected. Manage it from the server catalog.`,
      ),
    ).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it("surfaces the backend message when registration reports failure", async () => {
    mockCatalogQuery();
    mockRegister.mockResolvedValue({
      success: false,
      server_id: "",
      message: "Catalog entry is unavailable",
    });
    const user = userEvent.setup();
    const onConnected = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={onConnected}
        onBrowseCatalog={vi.fn()}
      />,
    );

    await selectFirstCuratedCard(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Catalog entry is unavailable")).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it("closes without connecting when Cancel is clicked", async () => {
    mockCatalogQuery();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConnected = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={onOpenChange}
        onConnected={onConnected}
        onBrowseCatalog={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConnected).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("calls onBrowseCatalog when the browse-catalog link is clicked", async () => {
    mockCatalogQuery();
    const user = userEvent.setup();
    const onBrowseCatalog = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={vi.fn()}
        onBrowseCatalog={onBrowseCatalog}
      />,
    );

    await user.click(screen.getByRole("button", { name: "server catalog" }));
    expect(onBrowseCatalog).toHaveBeenCalled();
  });

  // The dialog is vertically centred, so a shorter loading state would re-centre the box the
  // moment the grid arrives. Loading, error and empty all reserve the loaded grid's height.
  it("reserves the loaded grid's height while the catalog is loading", () => {
    mockCatalogQuery({ data: undefined, isLoading: true });
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(document.querySelectorAll("[aria-hidden='true'] > div.rounded-xl")).toHaveLength(
      QUICK_ADD_CATALOG_IDS.length,
    );
  });

  it("keeps the reserved height behind the empty state", () => {
    mockCatalogQuery({
      data: { servers: [], total: 0, categories: [], auth_types: [], providers: [] },
    });
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.getByText("No quick add servers available right now.")).toBeInTheDocument();
    expect(document.querySelectorAll("[aria-hidden='true'] > div.rounded-xl")).toHaveLength(
      QUICK_ADD_CATALOG_IDS.length,
    );
  });

  it("shows an error state when the catalog fails to load", () => {
    mockCatalogQuery({ data: undefined, error: { message: "network error" } });
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onConnected={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.getByText("Unable to load quick add servers. Try again.")).toBeInTheDocument();
  });
});
