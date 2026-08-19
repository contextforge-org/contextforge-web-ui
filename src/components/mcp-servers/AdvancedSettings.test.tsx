import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders as render, screen, waitFor } from "@/test/test-utils";
import userEvent from "@testing-library/user-event";
import { api } from "@/api/client";
import * as AuthContextModule from "@/auth/AuthContext";
import { AdvancedSettings } from "./AdvancedSettings";

vi.mock("@/auth/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: { get: vi.fn() },
}));

const mockUseAuthContext = vi.mocked(AuthContextModule.useAuthContext);
const mockGet = vi.mocked(api.get);

const personalTeam = { id: "team-personal", name: "Personal team", is_personal: true };
const sharedTeam = { id: "team-shared", name: "Shared team", is_personal: false };

/** Answers `GET /teams` with the given teams; everything else stays empty. */
function mockTeams(teams: Array<Record<string, unknown>>) {
  mockGet.mockImplementation((path: string) =>
    path === "/teams" ? Promise.resolve({ teams }) : Promise.resolve([]),
  );
}

type AdvancedSettingsProps = Parameters<typeof AdvancedSettings>[0];

const makeAuthContext = (selectedTeamId: string | null = null) =>
  ({
    selectedTeamId,
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    completePasswordChangeRequired: vi.fn(),
    logout: vi.fn(),
    setSelectedTeamId: vi.fn(),
    permissions: [],
    permissionsLoading: false,
    permissionsError: false,
    hasPermission: () => true,
  }) as ReturnType<typeof AuthContextModule.useAuthContext>;

const makeProps = (overrides: Partial<AdvancedSettingsProps> = {}): AdvancedSettingsProps => ({
  visibility: "public",
  onVisibilityChange: vi.fn(),
  teamId: "",
  onTeamIdChange: vi.fn(),
  authType: "none",
  onAuthTypeChange: vi.fn(),
  basicAuthUsername: "",
  basicAuthPassword: "", // pragma: allowlist secret
  onBasicAuthUsernameChange: vi.fn(),
  onBasicAuthPasswordChange: vi.fn(),
  bearerToken: "", // pragma: allowlist secret
  onBearerTokenChange: vi.fn(),
  customHeaders: [],
  onCustomHeadersChange: vi.fn(),
  oauthClientId: "",
  oauthClientSecret: "", // pragma: allowlist secret
  oauthTokenUrl: "",
  oauthGrantType: "client_credentials",
  oauthIssuerUrl: "",
  oauthRedirectUri: "",
  oauthAuthorizationUrl: "",
  oauthScopes: "",
  oauthStoreTokens: false,
  oauthAutoRefresh: false,
  oauthUsername: "",
  oauthPassword: "", // pragma: allowlist secret
  onOAuthClientIdChange: vi.fn(),
  onOAuthClientSecretChange: vi.fn(),
  onOAuthTokenUrlChange: vi.fn(),
  onOAuthGrantTypeChange: vi.fn(),
  onOAuthIssuerUrlChange: vi.fn(),
  onOAuthRedirectUriChange: vi.fn(),
  onOAuthAuthorizationUrlChange: vi.fn(),
  onOAuthScopesChange: vi.fn(),
  onOAuthStoreTokensChange: vi.fn(),
  onOAuthAutoRefreshChange: vi.fn(),
  onOAuthUsernameChange: vi.fn(),
  onOAuthPasswordChange: vi.fn(),
  queryParamName: "",
  queryParamApiKey: "", // pragma: allowlist secret
  onQueryParamNameChange: vi.fn(),
  onQueryParamApiKeyChange: vi.fn(),
  oneTimeAuth: false,
  onOneTimeAuthChange: vi.fn(),
  passthroughHeaders: "",
  onPassthroughHeadersChange: vi.fn(),
  onCACertificateFilesSelected: vi.fn(),
  ...overrides,
});

describe("AdvancedSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeams([personalTeam]);
    mockUseAuthContext.mockReturnValue(makeAuthContext());
  });

  it("renders the visibility info popover trigger", () => {
    render(<AdvancedSettings {...makeProps()} />);

    expect(screen.getByRole("button", { name: "About visibility levels" })).toBeInTheDocument();
  });

  // The sidebar switcher is authoritative while *creating* only. Edit mode is
  // covered separately below: an existing server keeps its own team.
  describe("team visibility — teamId sync while creating (issue #5077)", () => {
    it("syncs teamId with selectedTeamId on mount when visibility is team and teamId is unset", () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-A"));
      const onTeamIdChange = vi.fn();

      render(
        <AdvancedSettings {...makeProps({ visibility: "team", teamId: "", onTeamIdChange })} />,
      );

      expect(onTeamIdChange).toHaveBeenCalledWith("team-A");
    });

    it("propagates a sidebar switch made after teamId is already resolved", () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-A"));
      const onTeamIdChange = vi.fn();
      const { rerender } = render(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );
      onTeamIdChange.mockClear();

      // User switches the sidebar team switcher to team-B before submitting
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-B"));
      rerender(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );

      expect(onTeamIdChange).toHaveBeenCalledWith("team-B");
    });

    it("does not call onTeamIdChange when selectedTeamId already matches teamId", () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-A"));
      const onTeamIdChange = vi.fn();

      render(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );

      expect(onTeamIdChange).not.toHaveBeenCalled();
    });

    it("clears teamId when visibility changes away from team", () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-A"));
      const onTeamIdChange = vi.fn();
      const { rerender } = render(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );
      onTeamIdChange.mockClear();

      rerender(
        <AdvancedSettings
          {...makeProps({ visibility: "public", teamId: "team-A", onTeamIdChange })}
        />,
      );

      expect(onTeamIdChange).toHaveBeenCalledWith("");
    });

    it("falls back to the caller's own team on a switch to All teams", () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-A"));
      const onTeamIdChange = vi.fn();
      const { rerender } = render(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );
      onTeamIdChange.mockClear();

      mockUseAuthContext.mockReturnValue(makeAuthContext(null));
      rerender(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );

      // "All teams" is not a scope a server can be created in, so the form
      // falls back rather than leaving it unscoped.
      return waitFor(() => {
        expect(onTeamIdChange).toHaveBeenCalledWith(personalTeam.id);
      });
    });

    it("does not call onTeamIdChange when visibility is not team and teamId is already empty", () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-A"));
      const onTeamIdChange = vi.fn();

      render(
        <AdvancedSettings {...makeProps({ visibility: "public", teamId: "", onTeamIdChange })} />,
      );

      expect(onTeamIdChange).not.toHaveBeenCalled();
    });

    it("tracks each subsequent sidebar team switch while visibility stays team", () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext("team-A"));
      const onTeamIdChange = vi.fn();
      const { rerender } = render(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );
      onTeamIdChange.mockClear();

      mockUseAuthContext.mockReturnValue(makeAuthContext("team-B"));
      rerender(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-A", onTeamIdChange })}
        />,
      );
      expect(onTeamIdChange).toHaveBeenCalledWith("team-B");
      onTeamIdChange.mockClear();

      mockUseAuthContext.mockReturnValue(makeAuthContext("team-C"));
      rerender(
        <AdvancedSettings
          {...makeProps({ visibility: "team", teamId: "team-B", onTeamIdChange })}
        />,
      );
      expect(onTeamIdChange).toHaveBeenCalledWith("team-C");
    });
  });

  describe("team visibility — teamId sync while editing", () => {
    it("keeps the server's own team when the sidebar is on All teams", async () => {
      mockTeams([personalTeam, sharedTeam]);
      mockUseAuthContext.mockReturnValue(makeAuthContext(null));
      const onTeamIdChange = vi.fn();

      render(
        <AdvancedSettings
          {...makeProps({
            visibility: "team",
            teamId: sharedTeam.id,
            initialTeamId: sharedTeam.id,
            onTeamIdChange,
          })}
        />,
      );

      // Resolving to the personal team here would silently retarget the server.
      await screen.findByRole("combobox", { name: /^team/i });
      expect(onTeamIdChange).not.toHaveBeenCalled();
    });

    it("restores the server's own team once it loads after the fallback resolved", async () => {
      mockTeams([personalTeam, sharedTeam]);
      mockUseAuthContext.mockReturnValue(makeAuthContext(null));
      const onTeamIdChange = vi.fn();

      // The server request has not landed yet, so the form falls back.
      const { rerender } = render(
        <AdvancedSettings {...makeProps({ visibility: "team", teamId: "", onTeamIdChange })} />,
      );
      await waitFor(() => {
        expect(onTeamIdChange).toHaveBeenCalledWith(personalTeam.id);
      });
      onTeamIdChange.mockClear();

      rerender(
        <AdvancedSettings
          {...makeProps({
            visibility: "team",
            teamId: personalTeam.id,
            initialTeamId: sharedTeam.id,
            onTeamIdChange,
          })}
        />,
      );

      await waitFor(() => {
        expect(onTeamIdChange).toHaveBeenCalledWith(sharedTeam.id);
      });
    });

    it("ignores a sidebar switch, unlike create mode", () => {
      mockTeams([personalTeam, sharedTeam]);
      mockUseAuthContext.mockReturnValue(makeAuthContext(sharedTeam.id));
      const onTeamIdChange = vi.fn();
      const { rerender } = render(
        <AdvancedSettings
          {...makeProps({
            visibility: "team",
            teamId: sharedTeam.id,
            initialTeamId: sharedTeam.id,
            onTeamIdChange,
          })}
        />,
      );
      onTeamIdChange.mockClear();

      mockUseAuthContext.mockReturnValue(makeAuthContext("team-B"));
      rerender(
        <AdvancedSettings
          {...makeProps({
            visibility: "team",
            teamId: sharedTeam.id,
            initialTeamId: sharedTeam.id,
            onTeamIdChange,
          })}
        />,
      );

      expect(onTeamIdChange).not.toHaveBeenCalled();
    });

    it("still lets the caller retarget the server from the selector", async () => {
      mockTeams([personalTeam, sharedTeam]);
      mockUseAuthContext.mockReturnValue(makeAuthContext(null));
      const onTeamIdChange = vi.fn();
      const user = userEvent.setup();

      render(
        <AdvancedSettings
          {...makeProps({
            visibility: "team",
            teamId: sharedTeam.id,
            initialTeamId: sharedTeam.id,
            onTeamIdChange,
          })}
        />,
      );

      await user.click(await screen.findByRole("combobox", { name: /^team/i }));
      await user.click(screen.getByRole("option", { name: personalTeam.name }));

      expect(onTeamIdChange).toHaveBeenCalledWith(personalTeam.id);
    });
  });

  describe("team visibility — selector", () => {
    it("stays hidden for a single team", async () => {
      render(<AdvancedSettings {...makeProps({ visibility: "team", teamId: personalTeam.id })} />);

      await waitFor(() => {
        expect(screen.queryByRole("combobox", { name: /^team/i })).not.toBeInTheDocument();
      });
    });

    it("lists the caller's teams", async () => {
      mockTeams([personalTeam, sharedTeam]);

      render(<AdvancedSettings {...makeProps({ visibility: "team", teamId: personalTeam.id })} />);

      const teamSelect = await screen.findByRole("combobox", { name: /^team/i });
      expect(teamSelect).toHaveTextContent("Personal team");
    });

    it("stays hidden when visibility is not team", async () => {
      mockTeams([personalTeam, sharedTeam]);

      render(<AdvancedSettings {...makeProps({ visibility: "public" })} />);

      await waitFor(() => {
        expect(screen.queryByRole("combobox", { name: /^team/i })).not.toBeInTheDocument();
      });
    });
  });

  describe("authentication settings", () => {
    it("renders auth content according to authType", () => {
      const { rerender } = render(<AdvancedSettings {...makeProps()} />);

      expect(screen.queryByLabelText(/Username/i)).not.toBeInTheDocument();

      rerender(<AdvancedSettings {...makeProps({ authType: "basic" })} />);
      expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();

      rerender(<AdvancedSettings {...makeProps({ authType: "bearer" })} />);
      expect(screen.getByPlaceholderText(/Paste bearer token/i)).toBeInTheDocument();

      rerender(<AdvancedSettings {...makeProps({ authType: "custom" })} />);
      expect(screen.getByRole("button", { name: /\+?\s*Add header/i })).toBeInTheDocument();

      rerender(<AdvancedSettings {...makeProps({ authType: "oauth" })} />);
      expect(screen.getByLabelText(/Client ID/i)).toBeInTheDocument();

      rerender(<AdvancedSettings {...makeProps({ authType: "query" })} />);
      expect(screen.getByLabelText(/Parameter name/i)).toBeInTheDocument();

      rerender(<AdvancedSettings {...makeProps({ authType: "invalid-type" as never })} />);
      expect(screen.queryByLabelText(/Username/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Paste bearer token/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Parameter name/i)).not.toBeInTheDocument();
    });

    it("renders warning when oneTimeAuth is true", () => {
      const { rerender } = render(<AdvancedSettings {...makeProps({ oneTimeAuth: false })} />);
      expect(screen.queryByText(/Add passthrough headers when one-time/i)).not.toBeInTheDocument();

      rerender(<AdvancedSettings {...makeProps({ oneTimeAuth: true })} />);
      expect(screen.getByText(/Add passthrough headers when one-time/i)).toBeInTheDocument();
    });

    it("calls callback handlers when inputs change", async () => {
      const user = userEvent.setup();
      const handleAuthTypeChange = vi.fn();
      const handleOneTimeAuthChange = vi.fn();
      const handlePassthroughHeadersChange = vi.fn();

      render(
        <AdvancedSettings
          {...makeProps({
            onAuthTypeChange: handleAuthTypeChange,
            onOneTimeAuthChange: handleOneTimeAuthChange,
            onPassthroughHeadersChange: handlePassthroughHeadersChange,
          })}
        />,
      );

      await user.click(screen.getByLabelText("Basic"));
      expect(handleAuthTypeChange).toHaveBeenCalledWith("basic");

      await user.click(screen.getByRole("switch", { name: /One-time authentication/i }));
      expect(handleOneTimeAuthChange).toHaveBeenCalled();

      await user.type(screen.getByLabelText("Passthrough headers"), "X-Custom-Header");
      expect(handlePassthroughHeadersChange).toHaveBeenCalled();
    });
  });
});
