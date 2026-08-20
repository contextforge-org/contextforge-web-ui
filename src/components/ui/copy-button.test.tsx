import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the idle label as both aria-label and hover tooltip before any click", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="abc" label="Copy resource ID" />);

    const button = screen.getByRole("button", { name: "Copy resource ID" });
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy resource ID");
  });

  it("copies the value, shows the Check icon, and announces the copied label once", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyButton value="abc" label="Copy resource ID" />);

    const button = screen.getByRole("button", { name: "Copy resource ID" });
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith("abc");
    expect(button.querySelector("svg")).toHaveClass("text-emerald-600");
    // aria-label stays fixed; the transient state is announced via a single status region.
    expect(button).toHaveAttribute("aria-label", "Copy resource ID");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Copied!");
  });

  it("stops the click from bubbling to an ancestor (e.g. a clickable table row)", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <CopyButton value="abc" label="Copy resource ID" />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Copy resource ID" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
