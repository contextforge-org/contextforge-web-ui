import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select, SelectTrigger, SelectValue } from "./select";

describe("Select Components", () => {
  it("allows className to override the default height (CVA variant, not data-[size=*])", () => {
    render(
      <Select>
        <SelectTrigger className="h-12" data-testid="trigger-h12">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    const trigger = screen.getByTestId("trigger-h12");
    expect(trigger.className).not.toContain("h-10");
    expect(trigger.className).toContain("h-12");
  });

  it("defaults SelectTrigger to h-10", () => {
    render(
      <Select>
        <SelectTrigger data-testid="trigger-height">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByTestId("trigger-height")).toHaveClass("h-10");
  });

  it("defaults SelectTrigger to w-full", () => {
    render(
      <Select>
        <SelectTrigger data-testid="trigger-width">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByTestId("trigger-width")).toHaveClass("w-full");
  });

  it("renders SelectTrigger with sm size", () => {
    render(
      <Select>
        <SelectTrigger size="sm" data-testid="trigger-sm">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>,
    );

    expect(screen.getByTestId("trigger-sm")).toHaveAttribute("data-size", "sm");
  });
});
