import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CatalogServer } from "@/generated/types";
import { renderWithProviders } from "@/test/test-utils";
import { CatalogResults } from "./CatalogResults";

const availableServer: CatalogServer = {
  id: "public-notes",
  name: "Public Notes",
  category: "Productivity",
  url: "https://notes.example/mcp",
  auth_type: "Open",
  provider: "Example",
  description: "Search public notes and documents",
  tags: ["search", "documents"],
  is_registered: false,
};

function catalogResults(
  server: CatalogServer,
  addingServerIds: ReadonlySet<string> = new Set(),
  testingServerIds: ReadonlySet<string> = new Set(),
  disconnectingServerIds: ReadonlySet<string> = new Set(),
) {
  return (
    <CatalogResults
      servers={[server]}
      emptyStateMessageId="mcpServer.catalog.empty"
      onView={vi.fn()}
      onAdd={vi.fn()}
      addingServerIds={addingServerIds}
      onTest={vi.fn()}
      onDisconnect={vi.fn()}
      testingServerIds={testingServerIds}
      disconnectingServerIds={disconnectingServerIds}
      canTest={false}
      canDisconnect={false}
    />
  );
}

describe("CatalogResults", () => {
  it("gives add states a server-specific accessible name", () => {
    const { rerender } = renderWithProviders(catalogResults(availableServer));

    expect(screen.getByRole("button", { name: "Add Public Notes" })).toBeInTheDocument();

    rerender(catalogResults(availableServer, new Set([availableServer.id])));

    expect(screen.getByRole("button", { name: "Adding Public Notes…" })).toBeDisabled();
  });

  it("moves focus from Add to Actions after registration", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(catalogResults(availableServer));

    const addButton = screen.getByRole("button", { name: "Add Public Notes" });
    await user.click(addButton);
    expect(addButton).toHaveFocus();

    rerender(catalogResults({ ...availableServer, is_registered: true }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Public Notes" })).toHaveFocus(),
    );
  });

  it("aligns the Actions menu to the card's trailing edge", async () => {
    const user = userEvent.setup();
    renderWithProviders(catalogResults({ ...availableServer, is_registered: true }));

    await user.click(screen.getByRole("button", { name: "Actions for Public Notes" }));

    expect(await screen.findByRole("menu")).toHaveAttribute("data-align", "end");
  });

  it("shows testing and disconnecting status on the affected card", () => {
    const connectedServer = { ...availableServer, is_registered: true, gateway_id: "gateway-1" };
    const { rerender } = renderWithProviders(
      catalogResults(connectedServer, new Set(), new Set([connectedServer.id])),
    );

    expect(screen.getByText("Testing connection…")).toHaveAttribute("role", "status");

    rerender(catalogResults(connectedServer, new Set(), new Set(), new Set([connectedServer.id])));

    expect(screen.getByText("Disconnecting…")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("routes bundled catalog logos through the BFF", () => {
    const { container } = renderWithProviders(
      catalogResults({ ...availableServer, logo_url: "/static/catalog-icons/asana.png" }),
    );

    const logo = container.querySelector("img");

    expect(logo).toHaveAttribute("src", "/api/static/catalog-icons/asana.png");
    expect(logo).toHaveClass("size-full", "object-contain");
    expect(logo?.parentElement).not.toHaveClass("bg-muted");
  });

  it("rejects local logo paths outside the catalog icon directory", () => {
    const { container } = renderWithProviders(
      catalogResults({ ...availableServer, logo_url: "/static/admin.png" }),
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
