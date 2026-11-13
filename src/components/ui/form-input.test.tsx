import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormInput } from "./form-input";

describe("FormInput", () => {
  it("is an input carrying the form styling", () => {
    render(<FormInput aria-label="Name" defaultValue="Echo" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveValue("Echo");
    expect(input).toHaveClass("rounded-md", "border-neutral-300", "shadow-none");
  });

  it("lets the caller add classes", () => {
    render(<FormInput aria-label="Name" className="font-mono" />);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveClass("font-mono", "px-4");
  });
});
