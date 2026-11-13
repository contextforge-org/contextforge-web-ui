import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedRadio } from "./segmented-radio";

const options = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic" },
  { value: "custom", label: "Custom headers", wide: true },
] as const;

describe("SegmentedRadio", () => {
  it("renders a labelled radio group with the chosen option checked", () => {
    render(
      <SegmentedRadio
        label="Authentication type"
        idPrefix="auth"
        options={options}
        value="basic"
        onChange={() => undefined}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Authentication type" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Basic" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "None" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Basic" })).toHaveAttribute("id", "auth-basic");
    expect(screen.getByRole("radio", { name: "Basic" })).toHaveAttribute("name", "auth-type");
  });

  it("reports the option whose label is clicked", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedRadio
        label="Authentication type"
        idPrefix="auth"
        options={options}
        value="none"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText("Custom headers"));
    expect(onChange).toHaveBeenCalledWith("custom");
  });
});
