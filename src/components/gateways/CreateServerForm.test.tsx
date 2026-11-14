import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { AuthProvider } from "@/auth/AuthContext";
import { server } from "@/test/mocks/server";
import { renderWithProviders } from "@/test/test-utils";
import { CreateServerForm } from "./CreateServerForm";

// `useTeamScope` reads the sidebar team from AuthContext, so every render
// needs the provider even when the test never touches the team selector.
function renderForm(ui: React.ReactElement) {
  return renderWithProviders(<AuthProvider>{ui}</AuthProvider>);
}

const defaultProps = {
  onCancel: vi.fn(),
  onSuccess: vi.fn(),
};

const nameInput = () => screen.getByRole("textbox", { name: /^Name/ });
const optionalToggle = () => screen.getByRole("button", { name: "Optional configuration" });

describe("CreateServerForm", () => {
  it("renders the default title, description and submit label from intl", () => {
    renderForm(<CreateServerForm {...defaultProps} />);
    expect(screen.getByRole("heading", { level: 1, name: "Create server" })).toBeInTheDocument();
    expect(screen.getByText(/Compose a single endpoint/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("renders custom title when provided", () => {
    renderForm(<CreateServerForm {...defaultProps} title="Edit Server" />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit Server" })).toBeInTheDocument();
  });

  it("renders custom description when provided", () => {
    renderForm(<CreateServerForm {...defaultProps} description="Create a new MCP server" />);
    expect(screen.getByText("Create a new MCP server")).toBeInTheDocument();
  });

  it("renders an empty server name input", () => {
    renderForm(<CreateServerForm {...defaultProps} />);
    expect(nameInput()).toHaveValue("");
  });

  it("renders the three visibility options with Internal selected by default", () => {
    renderForm(<CreateServerForm {...defaultProps} />);
    expect(screen.getByRole("radiogroup", { name: "Visibility" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Internal" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Team" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Private" })).not.toBeChecked();
  });

  it("renders custom submitLabel", () => {
    renderForm(<CreateServerForm {...defaultProps} submitLabel="Save Changes" />);
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("renders submitError when provided", () => {
    renderForm(<CreateServerForm {...defaultProps} submitError="Server creation failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server creation failed");
  });

  it("does not render error alert when submitError is null", () => {
    renderForm(<CreateServerForm {...defaultProps} submitError={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderForm(<CreateServerForm {...defaultProps} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onSuccess with the form details when a valid form is submitted", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderForm(<CreateServerForm {...defaultProps} onSuccess={onSuccess} />);

    await user.type(nameInput(), "My Server");
    await user.click(screen.getByRole("radio", { name: "Private" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSuccess).toHaveBeenCalledWith({
      name: "My Server",
      visibility: "private",
      oauthEnabled: false,
      tags: undefined,
      description: undefined,
    });
  });

  it("shows a validation error and does not call onSuccess when name is empty", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderForm(<CreateServerForm {...defaultProps} onSuccess={onSuccess} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Server name is required.")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("renders children when provided", () => {
    renderForm(
      <CreateServerForm {...defaultProps}>
        <div data-testid="custom-child">Custom Child</div>
      </CreateServerForm>,
    );
    expect(screen.getByTestId("custom-child")).toBeInTheDocument();
  });

  it("initializes with provided initial values", () => {
    renderForm(
      <CreateServerForm
        {...defaultProps}
        initialValues={{ name: "Preset Server", visibility: "team" }}
      />,
    );
    expect(nameInput()).toHaveValue("Preset Server");
    expect(screen.getByRole("radio", { name: "Team" })).toBeChecked();
  });

  it("disables submit button when isSubmitting=true", () => {
    renderForm(<CreateServerForm {...defaultProps} isSubmitting={true} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("keeps the optional section collapsed by default", () => {
    renderForm(<CreateServerForm {...defaultProps} />);
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: /Virtual server description/ })).toBeNull();
  });

  it("opens and closes the optional section when the toggle is clicked", async () => {
    const user = userEvent.setup();
    renderForm(<CreateServerForm {...defaultProps} />);

    await user.click(optionalToggle());
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: /Virtual server description/ })).toBeInTheDocument();

    await user.click(optionalToggle());
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: /Virtual server description/ })).toBeNull();
  });

  it("pre-opens optional section when initial values have tags", () => {
    renderForm(
      <CreateServerForm {...defaultProps} initialValues={{ tags: ["api"], description: "" }} />,
    );
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("pre-opens optional section when initial values have a description", () => {
    renderForm(
      <CreateServerForm {...defaultProps} initialValues={{ description: "Preset description" }} />,
    );
    expect(screen.getByRole("textbox", { name: /Virtual server description/ })).toHaveValue(
      "Preset description",
    );
  });

  describe("team visibility", () => {
    const twoTeams = [
      { id: "team-personal", name: "Personal team", is_personal: true },
      { id: "team-shared", name: "Shared team", is_personal: false },
    ];

    it("hides the selector for a single team and resolves its team silently", async () => {
      server.use(
        http.get("*/api/teams", () =>
          HttpResponse.json({
            teams: [{ id: "team-personal", name: "Personal team", is_personal: true }],
          }),
        ),
      );
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      renderForm(<CreateServerForm {...defaultProps} onSuccess={onSuccess} />);

      await user.click(screen.getByRole("radio", { name: "Team" }));
      expect(screen.queryByRole("combobox", { name: /^team/i })).not.toBeInTheDocument();

      await user.type(nameInput(), "My Server");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess.mock.calls[0][0].teamId).toBe("team-personal");
    });

    it("shows the selector for several teams only when visibility is team", async () => {
      server.use(http.get("*/api/teams", () => HttpResponse.json({ teams: twoTeams })));
      const user = userEvent.setup();
      renderForm(<CreateServerForm {...defaultProps} />);

      expect(screen.queryByRole("combobox", { name: /^team/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: "Team" }));
      expect(await screen.findByRole("combobox", { name: /^team/i })).toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: "Private" }));
      expect(screen.queryByRole("combobox", { name: /^team/i })).not.toBeInTheDocument();
    });

    it("sends the picked team on submit", async () => {
      server.use(http.get("*/api/teams", () => HttpResponse.json({ teams: twoTeams })));
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      renderForm(<CreateServerForm {...defaultProps} onSuccess={onSuccess} />);

      await user.click(screen.getByRole("radio", { name: "Team" }));
      const teamSelect = await screen.findByRole("combobox", { name: /^team/i });
      // The sidebar starts on "All teams", so the resolver defaults to the personal team.
      expect(teamSelect).toHaveTextContent("Personal team");

      await user.click(teamSelect);
      await user.click(screen.getByRole("option", { name: "Shared team" }));
      await user.type(nameInput(), "My Server");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess.mock.calls[0][0].teamId).toBe("team-shared");
    });

    it("keeps a team-scoped server on its own team when editing", async () => {
      // Fresh session (the sidebar starts on "All teams") editing a server
      // scoped to a team that is not the caller's personal team.
      server.use(http.get("*/api/teams", () => HttpResponse.json({ teams: twoTeams })));
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      renderForm(
        <CreateServerForm
          {...defaultProps}
          onSuccess={onSuccess}
          initialValues={{ name: "Edit me", visibility: "team", teamId: "team-shared" }}
        />,
      );

      const teamSelect = await screen.findByRole("combobox", { name: /^team/i });
      expect(teamSelect).toHaveTextContent("Shared team");

      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess.mock.calls[0][0].teamId).toBe("team-shared");
    });

    it("shows the team error and blocks submit when no team can be resolved", async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      renderForm(<CreateServerForm {...defaultProps} onSuccess={onSuccess} />);

      await user.click(screen.getByRole("radio", { name: "Team" }));
      await user.type(nameInput(), "My Server");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(
        screen.getByText(/team selection is required when visibility is set to team/i),
      ).toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("clears the team error when a team is picked", async () => {
      let resolveTeams: () => void = () => {};
      const teamsGate = new Promise<void>((resolve) => {
        resolveTeams = resolve;
      });
      server.use(
        http.get("*/api/teams", async () => {
          await teamsGate;
          return HttpResponse.json({ teams: twoTeams });
        }),
      );
      const user = userEvent.setup();
      renderForm(<CreateServerForm {...defaultProps} />);

      await user.click(screen.getByRole("radio", { name: "Team" }));
      await user.type(nameInput(), "My Server");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(
        screen.getByText(/team selection is required when visibility is set to team/i),
      ).toBeInTheDocument();

      resolveTeams();
      const teamSelect = await screen.findByRole("combobox", { name: /^team/i });
      await user.click(teamSelect);
      await user.click(screen.getByRole("option", { name: "Shared team" }));

      expect(
        screen.queryByText(/team selection is required when visibility is set to team/i),
      ).not.toBeInTheDocument();
    });
  });
});
