import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type { CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { renderWithProviders } from "@/test/test-utils";
import { CatalogOAuthDialog } from "./CatalogOAuthDialog";

vi.mock("@/hooks/useQuery", () => ({ useQuery: vi.fn() }));
vi.mock("@/hooks/useTeams", () => ({
  useTeamScope: () => ({ teams: [], onTeamChange: vi.fn() }),
}));

const server: CatalogServer = {
  id: "github",
  name: "GitHub",
  auth_type: "OAuth2.1",
  url: "https://github.com/mcp",
  category: "Developer Tools",
  provider: "GitHub",
  description: "GitHub OAuth server",
  is_registered: false,
};

const mockUseQuery = vi.mocked(useQuery);

function renderDialog(overrides: Partial<ComponentProps<typeof CatalogOAuthDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(true);
  mockUseQuery.mockReturnValue({ data: undefined } as ReturnType<typeof useQuery>);

  renderWithProviders(
    <CatalogOAuthDialog
      server={server}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      isSubmitting={false}
      {...overrides}
    />,
  );

  return { onOpenChange, onSubmit };
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole("dialog", { name: "Add GitHub" });
  await user.type(within(dialog).getByLabelText(/Issuer URL/i), "http://github.com");
  await user.type(within(dialog).getByLabelText(/^Scopes/i), "repo, read:user");
  await user.type(within(dialog).getByLabelText(/^Client ID/i), "github-client");
  await user.type(within(dialog).getByLabelText(/^Client Secret/i), "github-secret");
  await user.type(
    within(dialog).getByLabelText(/^Authorization URL/i),
    "https://github.com/login/oauth/authorize",
  );
  await user.type(
    within(dialog).getByLabelText(/^Token URL/i),
    "https://github.com/login/oauth/access_token",
  );
}

describe("CatalogOAuthDialog", () => {
  it("shows every required-field validation error without submitting", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Configure and authorize" }));

    expect(await screen.findByText("Enter a valid issuer URL.")).toBeInTheDocument();
    expect(screen.getByText("Enter at least one scope.")).toBeInTheDocument();
    expect(screen.getByText("Client ID is required.")).toBeInTheDocument();
    expect(screen.getByText("Client secret is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid authorization URL.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid token URL.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Issuer URL/i)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/Issuer URL/i)).toHaveAttribute(
      "aria-describedby",
      "catalog-oauth-issuer-error",
    );
    expect(screen.getByText("Enter a valid issuer URL.")).toHaveAttribute(
      "id",
      "catalog-oauth-issuer-error",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows callback URL and submits normalized authorization-code credentials", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(true);
    mockUseQuery.mockReturnValue({
      data: { redirectUri: "https://gateway.example/oauth/callback" },
    } as ReturnType<typeof useQuery>);

    renderWithProviders(
      <CatalogOAuthDialog
        server={server}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    expect(screen.getByText("Redirect URI")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Custom name (optional)"), " My GitHub ");
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Configure and authorize" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: "My GitHub",
        visibility: "private",
        team_id: null,
        oauth_credentials: {
          grant_type: "authorization_code",
          issuer: "http://github.com",
          client_id: "github-client",
          client_secret: "github-secret",
          authorization_url: "https://github.com/login/oauth/authorize",
          token_url: "https://github.com/login/oauth/access_token",
          scopes: ["repo", "read:user"],
        },
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("resets values and notifies parent when cancelled", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText("Custom name (optional)"), "Temporary name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Custom name (optional)")).toHaveValue("");
  });

  it("does not close while authorization is submitting", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({ isSubmitting: true });

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
