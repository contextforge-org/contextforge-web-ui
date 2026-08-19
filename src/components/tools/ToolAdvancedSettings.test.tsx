import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/api/client";
import * as AuthContextModule from "@/auth/AuthContext";
import { renderWithProviders } from "@/test/test-utils";
import { ToolAdvancedSettings } from "./ToolAdvancedSettings";
import { ToolBearerTokenAuth } from "./ToolBearerTokenAuth";

// Mock AuthContext — the sidebar team is per-test, so team resolution can be
// exercised against both a chosen team and "All teams".
vi.mock("@/auth/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
}));

const mockGet = vi.mocked(api.get);
const mockUseAuthContext = vi.mocked(AuthContextModule.useAuthContext);

const makeAuthContext = (selectedTeamId: string | null = "team-123") =>
  ({ selectedTeamId, user: null, token: null }) as unknown as ReturnType<
    typeof AuthContextModule.useAuthContext
  >;

beforeEach(() => {
  mockUseAuthContext.mockReturnValue(makeAuthContext());
});

const personalTeam = { id: "team-personal", name: "Personal team", is_personal: true };
const sharedTeam = { id: "team-shared", name: "Shared team", is_personal: false };

/** Answers `GET /teams` with the given teams; everything else stays empty. */
function mockTeams(teams: Array<Record<string, unknown>>) {
  mockGet.mockImplementation((path: string) =>
    path === "/teams" ? Promise.resolve({ teams }) : Promise.resolve([]),
  );
}

const defaultProps = {
  visibility: "public" as const,
  onVisibilityChange: vi.fn(),
  teamId: "",
  onTeamIdChange: vi.fn(),
  authType: "none" as const,
  onAuthTypeChange: vi.fn(),
  basicAuthUsername: "",
  basicAuthPassword: "", // pragma: allowlist secret
  onBasicAuthUsernameChange: vi.fn(),
  onBasicAuthPasswordChange: vi.fn(),
  bearerToken: "",
  onBearerTokenChange: vi.fn(),
  customHeaders: [],
  onCustomHeadersChange: vi.fn(),
  responseFilter: "",
  onResponseFilterChange: vi.fn(),
  tags: [] as string[],
  onTagsChange: vi.fn(),
  description: "",
  onDescriptionChange: vi.fn(),
};

describe("ToolBearerTokenAuth", () => {
  it("renders token label", () => {
    render(<ToolBearerTokenAuth token="" onTokenChange={vi.fn()} />);
    expect(screen.getByText("Token")).toBeTruthy();
  });

  it("renders required star", () => {
    render(<ToolBearerTokenAuth token="" onTokenChange={vi.fn()} />);
    expect(screen.getByText("*")).toBeTruthy();
  });

  it("renders password type input", () => {
    render(<ToolBearerTokenAuth token="" onTokenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Paste bearer token/i) as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("displays current token value", () => {
    render(<ToolBearerTokenAuth token="abc123" onTokenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Paste bearer token/i) as HTMLInputElement;
    expect(input.value).toBe("abc123");
  });

  it("calls onTokenChange when input changes", () => {
    const onTokenChange = vi.fn();
    render(<ToolBearerTokenAuth token="" onTokenChange={onTokenChange} />);
    const input = screen.getByPlaceholderText(/Paste bearer token/i);
    fireEvent.change(input, { target: { value: "new-token" } });
    expect(onTokenChange).toHaveBeenCalledWith("new-token");
  });
});

describe("ToolAdvancedSettings", () => {
  it("renders visibility section", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} />);
    expect(screen.getByText("Visibility")).toBeTruthy();
  });

  it("renders authentication type section", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} />);
    expect(screen.getByText("Authentication type")).toBeTruthy();
  });

  it("renders all auth type options", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} />);
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.getByText("Basic")).toBeTruthy();
    expect(screen.getByText("Bearer token")).toBeTruthy();
    expect(screen.getByText("Custom headers")).toBeTruthy();
  });

  it("renders response filter field", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} />);
    expect(screen.getByLabelText(/Response filter/i)).toBeTruthy();
  });

  it("renders tags field", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} />);
    expect(screen.getByLabelText(/Tags/i)).toBeTruthy();
  });

  it("renders description field", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} />);
    expect(screen.getByLabelText(/Description/i)).toBeTruthy();
  });

  it("calls onAuthTypeChange when radio changes to basic", () => {
    const onAuthTypeChange = vi.fn();
    renderWithProviders(
      <ToolAdvancedSettings {...defaultProps} onAuthTypeChange={onAuthTypeChange} />,
    );
    const basicRadio = screen.getByRole("radio", { name: /Basic/i });
    fireEvent.click(basicRadio);
    expect(onAuthTypeChange).toHaveBeenCalledWith("basic");
  });

  it("calls onAuthTypeChange when radio changes to bearer", () => {
    const onAuthTypeChange = vi.fn();
    renderWithProviders(
      <ToolAdvancedSettings {...defaultProps} onAuthTypeChange={onAuthTypeChange} />,
    );
    const bearerRadio = screen.getByRole("radio", { name: /Bearer token/i });
    fireEvent.click(bearerRadio);
    expect(onAuthTypeChange).toHaveBeenCalledWith("bearer");
  });

  it("calls onAuthTypeChange when radio changes to custom", () => {
    const onAuthTypeChange = vi.fn();
    renderWithProviders(
      <ToolAdvancedSettings {...defaultProps} onAuthTypeChange={onAuthTypeChange} />,
    );
    const customRadio = screen.getByRole("radio", { name: /Custom headers/i });
    fireEvent.click(customRadio);
    expect(onAuthTypeChange).toHaveBeenCalledWith("custom");
  });

  it("shows BasicAuth component when authType is basic", () => {
    renderWithProviders(
      <ToolAdvancedSettings {...defaultProps} authType="basic" basicAuthUsername="admin" />,
    );
    expect(screen.getByLabelText(/Username/i)).toBeTruthy();
    expect(screen.getByLabelText(/Password/i)).toBeTruthy();
  });

  it("shows ToolBearerTokenAuth when authType is bearer", () => {
    renderWithProviders(
      <ToolAdvancedSettings {...defaultProps} authType="bearer" bearerToken="mytoken" />,
    );
    const input = screen.getByPlaceholderText(/Paste bearer token/i) as HTMLInputElement;
    expect(input.value).toBe("mytoken");
  });

  it("shows CustomHeadersAuth when authType is custom", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} authType="custom" />);
    expect(screen.getByRole("button", { name: /Add header/i })).toBeTruthy();
  });

  it("renders no auth content when authType is none", () => {
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} authType="none" />);
    // No basic/bearer/custom fields should be visible
    expect(screen.queryByLabelText(/Username/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/Paste bearer token/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Add header/i })).toBeNull();
  });

  describe("team visibility", () => {
    it("renders no selector for a single team", async () => {
      mockTeams([personalTeam]);

      renderWithProviders(<ToolAdvancedSettings {...defaultProps} visibility="team" />);

      await waitFor(() => {
        expect(screen.queryByRole("combobox", { name: /^team/i })).not.toBeInTheDocument();
      });
    });

    it("renders a selector for several teams", async () => {
      mockTeams([personalTeam, sharedTeam]);

      renderWithProviders(
        <ToolAdvancedSettings {...defaultProps} visibility="team" teamId={sharedTeam.id} />,
      );

      expect(await screen.findByRole("combobox", { name: /^team/i })).toHaveTextContent(
        "Shared team",
      );
    });

    it("resolves to the sidebar team while creating", async () => {
      mockTeams([personalTeam, sharedTeam]);
      const onTeamIdChange = vi.fn();

      renderWithProviders(
        <ToolAdvancedSettings
          {...defaultProps}
          visibility="team"
          teamId=""
          onTeamIdChange={onTeamIdChange}
        />,
      );

      await waitFor(() => {
        expect(onTeamIdChange).toHaveBeenCalledWith("team-123");
      });
    });

    it("keeps the tool's own team while editing, over the sidebar team", async () => {
      mockTeams([personalTeam, sharedTeam]);
      const onTeamIdChange = vi.fn();

      renderWithProviders(
        <ToolAdvancedSettings
          {...defaultProps}
          visibility="team"
          teamId={sharedTeam.id}
          initialTeamId={sharedTeam.id}
          onTeamIdChange={onTeamIdChange}
        />,
      );

      // The sidebar sits on team-123; honouring it would retarget the tool.
      await screen.findByRole("combobox", { name: /^team/i });
      expect(onTeamIdChange).not.toHaveBeenCalled();
    });

    it("keeps the tool's own team while editing with the sidebar on All teams", async () => {
      mockTeams([personalTeam, sharedTeam]);
      mockUseAuthContext.mockReturnValue(makeAuthContext(null));
      const onTeamIdChange = vi.fn();

      renderWithProviders(
        <ToolAdvancedSettings
          {...defaultProps}
          visibility="team"
          teamId={sharedTeam.id}
          initialTeamId={sharedTeam.id}
          onTeamIdChange={onTeamIdChange}
        />,
      );

      await screen.findByRole("combobox", { name: /^team/i });
      expect(onTeamIdChange).not.toHaveBeenCalled();
    });

    it("still lets the caller retarget the tool from the selector", async () => {
      mockTeams([personalTeam, sharedTeam]);
      const onTeamIdChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ToolAdvancedSettings
          {...defaultProps}
          visibility="team"
          teamId={sharedTeam.id}
          initialTeamId={sharedTeam.id}
          onTeamIdChange={onTeamIdChange}
        />,
      );

      await user.click(await screen.findByRole("combobox", { name: /^team/i }));
      await user.click(screen.getByRole("option", { name: personalTeam.name }));

      expect(onTeamIdChange).toHaveBeenCalledWith(personalTeam.id);
    });
  });

  it("calls onResponseFilterChange when response filter changes", () => {
    const onResponseFilterChange = vi.fn();
    renderWithProviders(
      <ToolAdvancedSettings {...defaultProps} onResponseFilterChange={onResponseFilterChange} />,
    );
    const input = screen.getByLabelText(/Response filter/i);
    fireEvent.change(input, { target: { value: ".results" } });
    expect(onResponseFilterChange).toHaveBeenCalledWith(".results");
  });

  it("calls onTagsChange when a tag is committed", async () => {
    const onTagsChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ToolAdvancedSettings {...defaultProps} onTagsChange={onTagsChange} />);
    const input = screen.getByLabelText(/Tags/i);
    await user.type(input, "api{Enter}");
    expect(onTagsChange).toHaveBeenCalledWith(["api"]);
  });

  it("calls onDescriptionChange when description changes", () => {
    const onDescriptionChange = vi.fn();
    renderWithProviders(
      <ToolAdvancedSettings {...defaultProps} onDescriptionChange={onDescriptionChange} />,
    );
    const input = screen.getByLabelText(/Description/i);
    fireEvent.change(input, { target: { value: "My tool" } });
    expect(onDescriptionChange).toHaveBeenCalledWith("My tool");
  });
});
