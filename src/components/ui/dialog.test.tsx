import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";

describe("DialogContent", () => {
  it("bounds its height to the viewport and scrolls overflowing content", () => {
    // Tall dialogs must stay within the viewport so the header, top content,
    // and close button remain reachable instead of extending off-screen.
    render(
      <Dialog open={true}>
        <DialogContent data-testid="content">
          <DialogTitle>Tall dialog</DialogTitle>
          <DialogDescription>Lots of content</DialogDescription>
          {Array.from({ length: 100 }, (_, i) => (
            <p key={i}>Row {i}</p>
          ))}
        </DialogContent>
      </Dialog>,
    );

    const content = screen.getByTestId("content");
    expect(content).toHaveClass("max-h-[calc(100vh-2rem)]");
    expect(content).toHaveClass("overflow-y-auto");
  });

  it("renders an accessible close button", () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogDescription>Test description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
