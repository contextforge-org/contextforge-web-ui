import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { CopyValue } from "./copy-value";
import { copyToClipboard } from "@/lib/clipboard";

vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn() }));

describe("CopyValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the copy button's accessible label from the provided label", () => {
    render(<CopyValue label="Prompt ID" value="p-1" />);

    expect(screen.getByRole("button", { name: "Copy Prompt ID" })).toBeInTheDocument();
  });

  it("shows short values verbatim", () => {
    render(<CopyValue label="Prompt ID" value="p-1" />);

    expect(screen.getByText("p-1")).toBeInTheDocument();
  });

  it("shows more of a long value when given a larger maxLength", () => {
    const value = "https://agents.example.com/.well-known/agent-card.json";
    // The whole value sits in a screen-reader span only when the visible text is cut.
    const hasHiddenCopy = (root: HTMLElement) =>
      Array.from(root.querySelectorAll(".sr-only")).some((node) => node.textContent === value);

    const { container, unmount } = render(<CopyValue label="Source" value={value} />);
    expect(hasHiddenCopy(container)).toBe(true);
    unmount();

    const wide = render(<CopyValue label="Source" value={value} maxLength={80} />);
    expect(hasHiddenCopy(wide.container)).toBe(false);
    expect(wide.container).toHaveTextContent(value);
  });

  it("middle-truncates long values in the display", () => {
    const longValue = "abcdefghijklmnopqrstuvwxyz0123456789";
    render(<CopyValue label="ID" value={longValue} />);

    // The visible text is truncated (default max 24 chars), not the raw
    // value — the full value is present only in a visually-hidden span for
    // screen readers.
    const hidden = screen.getByText(longValue);
    expect(hidden).toHaveClass("sr-only");
  });

  it("copies the full value (not the truncated display) when clicked", async () => {
    const user = userEvent.setup();
    const longValue = "abcdefghijklmnopqrstuvwxyz0123456789";
    render(<CopyValue label="ID" value={longValue} />);

    await user.click(screen.getByRole("button", { name: /copy id/i }));
    expect(copyToClipboard).toHaveBeenCalledWith(longValue);
  });
});
