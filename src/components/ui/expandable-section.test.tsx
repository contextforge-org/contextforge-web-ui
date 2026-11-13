import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpandableSection } from "./expandable-section";

function Harness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <ExpandableSection label="More" open={open} onOpenChange={setOpen}>
      <p>Hidden details</p>
    </ExpandableSection>
  );
}

describe("ExpandableSection", () => {
  it("is collapsed until the caller opens it", async () => {
    render(<Harness />);
    expect(screen.queryByText("Hidden details")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Hidden details")).toBeVisible();
  });

  it("collapses again when the trigger is clicked a second time", async () => {
    render(<Harness initiallyOpen />);
    expect(screen.getByText("Hidden details")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByText("Hidden details")).not.toBeInTheDocument();
  });

  it("follows the open prop and reports changes", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ExpandableSection label="More" open={false} onOpenChange={onOpenChange}>
        <p>Hidden details</p>
      </ExpandableSection>,
    );
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // Not applied until the caller says so.
    expect(screen.queryByText("Hidden details")).not.toBeInTheDocument();

    rerender(
      <ExpandableSection label="More" open onOpenChange={onOpenChange}>
        <p>Hidden details</p>
      </ExpandableSection>,
    );
    expect(screen.getByText("Hidden details")).toBeVisible();
  });
});
