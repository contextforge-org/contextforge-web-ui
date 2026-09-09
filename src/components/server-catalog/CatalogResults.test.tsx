import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CatalogServer } from "@/generated/types";
import { renderWithProviders } from "@/test/test-utils";
import { CatalogResults, CatalogServerDetailsDialog } from "./CatalogResults";

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
      onAuthorize={vi.fn()}
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

  it("shows caller-scoped expired OAuth state and offers authorization retry", async () => {
    const user = userEvent.setup();
    const onAuthorize = vi.fn();
    const oauthServer: CatalogServer = {
      ...availableServer,
      id: "github",
      name: "GitHub",
      auth_type: "OAuth2.1",
      is_registered: true,
      gateway_id: "gateway-github",
    };

    renderWithProviders(
      <CatalogResults
        servers={[oauthServer]}
        emptyStateMessageId="mcpServer.catalog.empty"
        onView={vi.fn()}
        onAdd={vi.fn()}
        addingServerIds={new Set()}
        onTest={vi.fn()}
        onAuthorize={onAuthorize}
        onDisconnect={vi.fn()}
        canTest={false}
        canDisconnect={false}
        oauthStatuses={{
          "gateway-github": {
            oauth_enabled: true,
            user_token_status: { status: "expired", authorized: false },
          },
        }}
      />,
    );

    expect(screen.getByText("Authorization expired")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Actions for GitHub" }));
    await user.click(screen.getByRole("menuitem", { name: "Authorize" }));

    expect(onAuthorize).toHaveBeenCalledOnce();
  });

  it("shows valid and near-expiry caller OAuth states", () => {
    const validServer: CatalogServer = {
      ...availableServer,
      id: "github-valid",
      name: "GitHub valid",
      auth_type: "OAuth2.1",
      is_registered: true,
      gateway_id: "gateway-valid",
    };
    const expiringServer: CatalogServer = {
      ...availableServer,
      id: "github-expiring",
      name: "GitHub expiring",
      auth_type: "OAuth2.1",
      is_registered: true,
      gateway_id: "gateway-expiring",
    };

    renderWithProviders(
      <CatalogResults
        servers={[validServer, expiringServer]}
        emptyStateMessageId="mcpServer.catalog.empty"
        onView={vi.fn()}
        onAdd={vi.fn()}
        addingServerIds={new Set()}
        onTest={vi.fn()}
        onAuthorize={vi.fn()}
        onDisconnect={vi.fn()}
        canTest={false}
        canDisconnect={false}
        oauthStatuses={{
          "gateway-valid": {
            oauth_enabled: true,
            user_token_status: { status: "valid", authorized: true },
          },
          "gateway-expiring": {
            oauth_enabled: true,
            user_token_status: { status: "near_expiry", authorized: true },
          },
        }}
      />,
    );

    expect(screen.getByText("Authorization expires soon")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows authorization needed when OAuth configuration is incomplete", async () => {
    const user = userEvent.setup();
    const onAuthorize = vi.fn();
    const server = {
      ...availableServer,
      id: "github-pending",
      name: "GitHub pending",
      auth_type: "OAuth2.1",
      is_registered: true,
      gateway_id: "gateway-pending",
      requires_oauth_config: true,
    };

    renderWithProviders(
      <CatalogResults
        servers={[server]}
        emptyStateMessageId="mcpServer.catalog.empty"
        onView={vi.fn()}
        onAdd={vi.fn()}
        addingServerIds={new Set()}
        onTest={vi.fn()}
        onAuthorize={onAuthorize}
        onDisconnect={vi.fn()}
        canTest={false}
        canDisconnect={false}
      />,
    );

    expect(screen.getByText("Needs authorization")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Actions for GitHub pending" }));
    await user.click(screen.getByRole("menuitem", { name: "Authorize" }));
    expect(onAuthorize).toHaveBeenCalledOnce();
  });

  it("keeps a registered OAuth card connected while token status is unavailable", () => {
    const server = {
      ...availableServer,
      id: "github-status-pending",
      name: "GitHub status pending",
      auth_type: "OAuth2.1",
      is_registered: true,
      gateway_id: "gateway-status-pending",
    };

    renderWithProviders(
      <CatalogResults
        servers={[server]}
        emptyStateMessageId="mcpServer.catalog.empty"
        onView={vi.fn()}
        onAdd={vi.fn()}
        addingServerIds={new Set()}
        onTest={vi.fn()}
        onAuthorize={vi.fn()}
        onDisconnect={vi.fn()}
        canTest={false}
        canDisconnect={false}
      />,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows unregistered catalog servers as not connected in details", async () => {
    renderWithProviders(
      <CatalogServerDetailsDialog server={availableServer} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Not connected")).toBeInTheDocument();
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
