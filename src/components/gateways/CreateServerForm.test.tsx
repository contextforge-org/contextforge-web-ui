import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { CreateServerForm } from "./CreateServerForm";

const defaultProps = {
  onCancel: vi.fn(),
  onSuccess: vi.fn(),
};

const nameInput = () => screen.getByRole("textbox", { name: /^Name/ });
const optionalToggle = () => screen.getByRole("button", { name: "Optional configuration" });

describe("CreateServerForm", () => {
  it("renders the default title, description and submit label from intl", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} />);
    expect(screen.getByRole("heading", { level: 1, name: "Create server" })).toBeInTheDocument();
    expect(screen.getByText(/Compose a single endpoint/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("renders custom title when provided", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} title="Edit Server" />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit Server" })).toBeInTheDocument();
  });

  it("renders custom description when provided", () => {
    renderWithProviders(
      <CreateServerForm {...defaultProps} description="Create a new MCP server" />,
    );
    expect(screen.getByText("Create a new MCP server")).toBeInTheDocument();
  });

  it("renders an empty server name input", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} />);
    expect(nameInput()).toHaveValue("");
  });

  it("renders the three visibility options with Internal selected by default", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} />);
    expect(screen.getByRole("radiogroup", { name: "Visibility" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Internal" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Team" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Private" })).not.toBeChecked();
  });

  it("renders custom submitLabel", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} submitLabel="Save Changes" />);
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("renders submitError when provided", () => {
    renderWithProviders(
      <CreateServerForm {...defaultProps} submitError="Server creation failed" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Server creation failed");
  });

  it("does not render error alert when submitError is null", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} submitError={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(<CreateServerForm {...defaultProps} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onSuccess with the form details when a valid form is submitted", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithProviders(<CreateServerForm {...defaultProps} onSuccess={onSuccess} />);

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
    renderWithProviders(<CreateServerForm {...defaultProps} onSuccess={onSuccess} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Server name is required.")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("renders children when provided", () => {
    renderWithProviders(
      <CreateServerForm {...defaultProps}>
        <div data-testid="custom-child">Custom Child</div>
      </CreateServerForm>,
    );
    expect(screen.getByTestId("custom-child")).toBeInTheDocument();
  });

  it("initializes with provided initial values", () => {
    renderWithProviders(
      <CreateServerForm
        {...defaultProps}
        initialValues={{ name: "Preset Server", visibility: "team" }}
      />,
    );
    expect(nameInput()).toHaveValue("Preset Server");
    expect(screen.getByRole("radio", { name: "Team" })).toBeChecked();
  });

  it("disables submit button when isSubmitting=true", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} isSubmitting={true} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("keeps the optional section collapsed by default", () => {
    renderWithProviders(<CreateServerForm {...defaultProps} />);
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: /Virtual server description/ })).toBeNull();
  });

  it("opens and closes the optional section when the toggle is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateServerForm {...defaultProps} />);

    await user.click(optionalToggle());
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: /Virtual server description/ })).toBeInTheDocument();

    await user.click(optionalToggle());
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: /Virtual server description/ })).toBeNull();
  });

  it("pre-opens optional section when initial values have tags", () => {
    renderWithProviders(
      <CreateServerForm {...defaultProps} initialValues={{ tags: ["api"], description: "" }} />,
    );
    expect(optionalToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("pre-opens optional section when initial values have a description", () => {
    renderWithProviders(
      <CreateServerForm {...defaultProps} initialValues={{ description: "Preset description" }} />,
    );
    expect(screen.getByRole("textbox", { name: /Virtual server description/ })).toHaveValue(
      "Preset description",
    );
  });
});
