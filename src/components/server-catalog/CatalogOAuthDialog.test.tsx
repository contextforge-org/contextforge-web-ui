import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type { CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { renderWithProviders } from "@/test/test-utils";
import { CatalogOAuthDialog } from "./CatalogOAuthDialog";

vi.mock("@/hooks/useQuery", () => ({ useQuery: vi.fn() }));
const teamScopeState = vi.hoisted(() => ({
  teams: [] as Array<{ id: string; name: string }>,
  onTeamChange: vi.fn(),
}));
vi.mock("@/hooks/useTeams", () => ({
  useTeamScope: ({ onTeamIdChange }: { onTeamIdChange: (teamId: string) => void }) => ({
    teams: teamScopeState.teams,
    onTeamChange: (teamId: string) => {
      teamScopeState.onTeamChange(teamId);
      onTeamIdChange(teamId);
    },
  }),
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

function renderDialog(
  overrides: Partial<ComponentProps<typeof CatalogOAuthDialog>> = {},
  callbackQueryOverrides: Partial<ReturnType<typeof useQuery>> = {},
) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(true);
  mockUseQuery.mockReturnValue({
    data: { redirectUri: "http://localhost:3000/oauth/callback" },
    error: null,
    isLoading: false,
    execute: vi.fn(),
    refetch: vi.fn(),
    setData: vi.fn(),
    ...callbackQueryOverrides,
  } as ReturnType<typeof useQuery>);

  const rendered = renderWithProviders(
    <CatalogOAuthDialog
      server={server}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      isSubmitting={false}
      {...overrides}
    />,
  );

  return { onOpenChange, onSubmit, ...rendered };
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
  beforeEach(() => {
    teamScopeState.teams = [];
    teamScopeState.onTeamChange.mockReset();
  });

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

  it("prefills public OAuth metadata without pre-filling client credentials", () => {
    const oauthServer: CatalogServer = {
      ...server,
      oauth: {
        issuer: "https://github.com",
        authorization_url: "https://github.com/login/oauth/authorize",
        token_url: "https://github.com/login/oauth/access_token",
        scopes: ["repo", "read:user"],
        supports_dcr: false,
        resource: "https://api.githubcopilot.com/mcp",
      },
    };

    renderDialog({ server: oauthServer });

    expect(screen.getByLabelText(/Issuer URL/i)).toHaveValue("https://github.com");
    expect(screen.getByLabelText(/^Scopes/i)).toHaveValue("repo read:user");
    expect(screen.getByLabelText(/^Authorization URL/i)).toHaveValue(
      "https://github.com/login/oauth/authorize",
    );
    expect(screen.getByLabelText(/^Token URL/i)).toHaveValue(
      "https://github.com/login/oauth/access_token",
    );
    expect(screen.getByLabelText(/^Client ID/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Client Secret/i)).toHaveValue("");
  });

  it("submits the displayed BFF callback URL with normalized authorization-code credentials", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(true);
    mockUseQuery.mockReturnValue({
      data: { redirectUri: "http://localhost:3000/oauth/callback" },
      error: null,
      isLoading: false,
      execute: vi.fn(),
      refetch: vi.fn(),
      setData: vi.fn(),
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
    expect(screen.getByText("http://localhost:3000/oauth/callback")).toBeInTheDocument();
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
          client_secret: "github-secret", // pragma: allowlist secret
          authorization_url: "https://github.com/login/oauth/authorize",
          token_url: "https://github.com/login/oauth/access_token",
          redirect_uri: "http://localhost:3000/oauth/callback",
          scopes: ["repo", "read:user"],
        },
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    { data: undefined, isLoading: true, error: null },
    { data: undefined, isLoading: false, error: { message: "Unavailable" } },
    { data: {}, isLoading: false, error: null },
    { data: { redirectUri: "invalid" }, isLoading: false, error: null },
  ])("blocks registration when callback URL is unresolved: %j", async (callbackQuery) => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog({}, callbackQuery);

    await fillRequiredFields(user);

    const submitButton = screen.getByRole("button", { name: "Configure and authorize" });
    expect(submitButton).toBeDisabled();
    fireEvent.submit(submitButton.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        callbackQuery.isLoading
          ? "Loading redirect URI…"
          : "Couldn't load the default redirect URI. Save is disabled until this resolves.",
      ),
    ).toBeInTheDocument();
  });

  it("retries callback lookup and submits once it succeeds", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();
    const refetch = vi.fn().mockRejectedValue({ message: "Unavailable" });
    const { rerender } = renderDialog(
      { onSubmit, onOpenChange },
      { data: undefined, error: { message: "Unavailable" }, refetch },
    );
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Configure and authorize" })).toBeDisabled();

    mockUseQuery.mockReturnValue({
      data: { redirectUri: "https://web.example.com/oauth/callback" },
      error: null,
      isLoading: false,
      execute: vi.fn(),
      refetch,
      setData: vi.fn(),
    } as ReturnType<typeof useQuery>);
    rerender(
      <CatalogOAuthDialog
        server={server}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Configure and authorize" }));

    const expected = expect.objectContaining({
      redirect_uri: "https://web.example.com/oauth/callback",
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        oauth_credentials: expected, // pragma: allowlist secret
      }),
    );
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

  it("requires a team before submitting team-visible OAuth configuration", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByRole("combobox", { name: "Visibility" }));
    await user.click(screen.getByRole("option", { name: "Team" }));
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Configure and authorize" }));

    expect(await screen.findByText("Select a team.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits selected team for team-visible OAuth configuration", async () => {
    const user = userEvent.setup();
    teamScopeState.teams = [
      { id: "team-alpha", name: "Alpha team" },
      { id: "team-beta", name: "Beta team" },
    ];
    const { onSubmit } = renderDialog();

    await user.click(screen.getByRole("combobox", { name: "Visibility" }));
    await user.click(screen.getByRole("option", { name: "Team" }));
    await user.click(screen.getByRole("combobox", { name: /^Team/ }));
    await user.click(screen.getByRole("option", { name: "Alpha team" }));
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Configure and authorize" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: "team", team_id: "team-alpha" }),
      ),
    );
    expect(teamScopeState.onTeamChange).toHaveBeenCalledWith("team-alpha");
  });
});
