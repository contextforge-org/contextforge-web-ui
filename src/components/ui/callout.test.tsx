import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Callout } from "./callout";

describe("Callout", () => {
  it("renders children as a status region by default", () => {
    render(<Callout severity="warning">Heads up</Callout>);
    expect(screen.getByRole("status")).toHaveTextContent("Heads up");
  });

  it("accepts rich content for an emphasized prefix", () => {
    render(
      <Callout severity="warning">
        <strong>Warning:</strong> secrets go in the URL
      </Callout>,
    );
    expect(screen.getByText("Warning:").tagName).toBe("STRONG");
  });

  it("uses the tone class of its severity on a hidden icon", () => {
    const { container } = render(<Callout severity="warning">Heads up</Callout>);
    const icon = container.querySelector("svg");
    expect(icon).toHaveClass("text-warning");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("uses role='alert' for errors", () => {
    render(<Callout severity="error">Broken</Callout>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("lets callers override the role and merge className", () => {
    render(
      <Callout severity="info" role="note" className="mt-2">
        FYI
      </Callout>,
    );
    expect(screen.getByRole("note")).toHaveClass("bg-muted", "mt-2");
  });
});
