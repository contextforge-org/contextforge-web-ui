import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./sheet";

const renderSheet = (props: React.ComponentProps<typeof SheetContent> = {}) =>
  render(
    <Sheet open={true}>
      <SheetContent data-testid="content" {...props}>
        <SheetTitle>Title</SheetTitle>
        <SheetDescription>Description</SheetDescription>
      </SheetContent>
    </Sheet>,
  );

describe("SheetContent", () => {
  it("slides in from the right by default", () => {
    renderSheet();
    expect(screen.getByTestId("content")).toHaveAttribute("data-side", "right");
  });

  it.each(["left", "top", "bottom"] as const)("honors side=%s", (side) => {
    renderSheet({ side });
    expect(screen.getByTestId("content")).toHaveAttribute("data-side", side);
  });

  it("renders a close button by default", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("omits the close button when showCloseButton is false", () => {
    renderSheet({ showCloseButton: false });
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
