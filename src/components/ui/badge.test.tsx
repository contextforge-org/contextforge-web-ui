import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "./badge";

describe("Badge", () => {
  it("maps each named variant to its color token", () => {
    const expectations = {
      default: "bg-primary",
      secondary: "bg-secondary",
      destructive: "bg-destructive",
      outline: "text-foreground",
      success: "bg-success/15",
      warning: "bg-warning/15",
      draft: "bg-gray-100",
    } as const;

    for (const variant of Object.keys(expectations) as (keyof typeof expectations)[]) {
      expect(badgeVariants({ variant })).toContain(expectations[variant]);
    }
  });

  it("uses the default variant when none is given", () => {
    render(<Badge>Tag</Badge>);
    expect(screen.getByText("Tag")).toHaveClass("bg-primary");
  });
});
