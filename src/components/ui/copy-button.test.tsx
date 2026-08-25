import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps aria-label fixed and shows no bubble on hover", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="abc" label="Copy resource ID" />);

    const button = screen.getByRole("button", { name: "Copy resource ID" });
    await user.hover(button);

    expect(screen.queryByText("Copy resource ID")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows no bubble on focus", () => {
    render(<CopyButton value="abc" label="Copy resource ID" />);

    const button = screen.getByRole("button", { name: "Copy resource ID" });
    button.focus();

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("mounts the status region before any copy has happened", () => {
    render(<CopyButton value="abc" label="Copy resource ID" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("");
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

  it("shows the confirmation bubble on click, hidden from assistive tech", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyButton value="abc" label="Copy resource ID" />);

    await user.click(screen.getByRole("button", { name: "Copy resource ID" }));

    const bubble = screen.getByText("Copied!", { selector: "span[aria-hidden='true']" });
    expect(bubble).toBeInTheDocument();
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
