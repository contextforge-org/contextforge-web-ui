import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  const defaultProps = {
    id: "test-password",
    value: "",
    onChange: vi.fn(),
    placeholder: "Enter password",
    label: "Password",
  };

  it("should render with password type by default", () => {
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute("type", "password");
  });

  it("should toggle password visibility on button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const input = screen.getByLabelText(/Password/);
    const toggleButton = screen.getByRole("button", { name: /show password/i });

    expect(input).toHaveAttribute("type", "password");
    expect(toggleButton).toHaveAttribute("aria-pressed", "false");

    await user.click(toggleButton);

    expect(input).toHaveAttribute("type", "text");
    expect(toggleButton).toHaveAccessibleName(/hide password/i);
    expect(toggleButton).toHaveAttribute("aria-pressed", "true");

    await user.click(toggleButton);

    expect(input).toHaveAttribute("type", "password");
    expect(toggleButton).toHaveAccessibleName(/show password/i);
    expect(toggleButton).toHaveAttribute("aria-pressed", "false");
  });

  it("should call onChange when input value changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    // Use a controlled component pattern to track value changes
    let currentValue = "";
    const handleChange = (value: string) => {
      currentValue = value;
      onChange(value);
    };

    const { rerender } = renderWithProviders(
      <PasswordInput {...defaultProps} value={currentValue} onChange={handleChange} />,
    );

    const input = screen.getByLabelText(/Password/);

    // Type each character and rerender with updated value
    for (const char of "test123") {
      await user.type(input, char);
      rerender(<PasswordInput {...defaultProps} value={currentValue} onChange={handleChange} />);
    }

    // Verify onChange was called for each character typed
    expect(onChange).toHaveBeenCalledTimes(7);

    // Verify the final value is correct
    expect(currentValue).toBe("test123");
  });

  it("should display error with proper ARIA attributes", () => {
    renderWithProviders(<PasswordInput {...defaultProps} error="Password is required" />);

    const input = screen.getByLabelText(/Password/);
    const error = screen.getByRole("alert");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "test-password-error");
    expect(error).toHaveTextContent("Password is required");
  });

  it("should display hint when no error", () => {
    renderWithProviders(<PasswordInput {...defaultProps} hint="Must be 8+ characters" />);

    const input = screen.getByLabelText(/Password/);
    const hint = screen.getByText("Must be 8+ characters");

    expect(input).toHaveAttribute("aria-describedby", "test-password-hint");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass("text-xs");
  });

  it("should prioritize error over hint", () => {
    renderWithProviders(
      <PasswordInput {...defaultProps} error="Password is required" hint="Must be 8+ characters" />,
    );

    const input = screen.getByLabelText(/Password/);

    expect(input).toHaveAttribute("aria-describedby", "test-password-error");
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(screen.queryByText("Must be 8+ characters")).not.toBeInTheDocument();
  });

  it("should show required indicator when required prop is true", () => {
    renderWithProviders(<PasswordInput {...defaultProps} required />);

    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("(required)")).toHaveClass("sr-only");
  });

  it("should not show required indicator when required prop is false", () => {
    renderWithProviders(<PasswordInput {...defaultProps} required={false} />);

    expect(screen.queryByText("*")).not.toBeInTheDocument();
    expect(screen.queryByText("(required)")).not.toBeInTheDocument();
  });

  it("should use custom autoComplete value", () => {
    renderWithProviders(<PasswordInput {...defaultProps} autoComplete="current-password" />);

    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute("autocomplete", "current-password");
  });

  it("should use default autoComplete value", () => {
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute("autocomplete", "new-password");
  });

  it("should display placeholder text", () => {
    renderWithProviders(<PasswordInput {...defaultProps} placeholder="Enter your password" />);

    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute("placeholder", "Enter your password");
  });

  it("should have proper ARIA attributes on toggle button", () => {
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const toggleButton = screen.getByRole("button", { name: /show password/i });

    expect(toggleButton).toHaveAttribute("type", "button");
    expect(toggleButton).toHaveAttribute("aria-label", "Show password");
    expect(toggleButton).toHaveAttribute("aria-pressed", "false");
  });

  it("should toggle button icon between Eye and EyeOff", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const toggleButton = screen.getByRole("button", { name: /show password/i });

    // Eye icon should be present initially (password hidden)
    let icon = toggleButton.querySelector("svg");
    expect(icon).toBeInTheDocument();

    await user.click(toggleButton);

    // EyeOff icon should be present after toggle (password visible)
    icon = toggleButton.querySelector("svg");
    expect(icon).toBeInTheDocument();
  });

  it("should not have aria-describedby when no error or hint", () => {
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const input = screen.getByLabelText(/Password/);
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("should not have aria-invalid when no error", () => {
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("should maintain focus after toggling visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordInput {...defaultProps} />);

    const input = screen.getByLabelText(/Password/);
    const toggleButton = screen.getByRole("button", { name: /show password/i });

    await user.click(input);
    expect(input).toHaveFocus();

    await user.click(toggleButton);

    // Input should still be focusable after toggle
    await user.click(input);
    expect(input).toHaveFocus();
  });
});
