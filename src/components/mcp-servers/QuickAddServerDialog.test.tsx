import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { renderWithProviders } from "@/test/test-utils";
import { QUICK_ADD_CATALOG_IDS } from "@/config/quickAddServers";
import { QuickAddServerDialog } from "./QuickAddServerDialog";

vi.mock("@/hooks/useQuery", () => ({
  useQuery: vi.fn(),
}));

const mockUseQuery = vi.mocked(useQuery);

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

describe("QuickAddServerDialog", () => {
  it("renders only the curated catalog entries", () => {
    mockCatalogQuery();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.getByText(QUICK_ADD_CATALOG_IDS[0])).toBeInTheDocument();
    expect(screen.getByText(QUICK_ADD_CATALOG_IDS[1])).toBeInTheDocument();
    expect(screen.queryByText("not-curated")).not.toBeInTheDocument();
  });

  it("disables Continue until a card is selected, then calls onSelect with the picked server", async () => {
    mockCatalogQuery();
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onSelect={onSelect}
        onBrowseCatalog={vi.fn()}
      />,
    );

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: new RegExp(QUICK_ADD_CATALOG_IDS[0]) }));
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: QUICK_ADD_CATALOG_IDS[0] }),
    );
  });

  it("closes without selecting when Cancel is clicked", async () => {
    mockCatalogQuery();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        onBrowseCatalog={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onBrowseCatalog when the browse-catalog link is clicked", async () => {
    mockCatalogQuery();
    const user = userEvent.setup();
    const onBrowseCatalog = vi.fn();
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
        onBrowseCatalog={onBrowseCatalog}
      />,
    );

    await user.click(screen.getByRole("button", { name: "server catalog" }));
    expect(onBrowseCatalog).toHaveBeenCalled();
  });

  it("shows an error state when the catalog fails to load", () => {
    mockCatalogQuery({ data: undefined, error: { message: "network error" } });
    renderWithProviders(
      <QuickAddServerDialog
        open
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
        onBrowseCatalog={vi.fn()}
      />,
    );

    expect(screen.getByText("Unable to load quick add servers. Try again.")).toBeInTheDocument();
  });
});
