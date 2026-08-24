import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { TruncatedMiddleText, getTruncatedMiddle } from "./truncated-middle-text";

describe("getTruncatedMiddle", () => {
  it("reports no truncation for values within maxLength", () => {
    expect(getTruncatedMiddle("short", 24)).toEqual({ display: "short", isTruncated: false });
  });

  it("reports truncation for values beyond maxLength", () => {
    const value = "abcdefghijklmnopqrstuvwxyz0123456789";
    const result = getTruncatedMiddle(value, 24);

    expect(result.isTruncated).toBe(true);
    expect(result.display).not.toBe(value);
  });
});

describe("TruncatedMiddleText", () => {
  it("shows short values verbatim with no hidden duplicate and no aria-label", () => {
    render(<TruncatedMiddleText value="p-1" />);

    // Exactly one match: no sr-only duplicate is rendered for values that fit.
    const display = screen.getAllByText("p-1");
    expect(display).toHaveLength(1);
    // Not aria-label: a plain span's accessible name would otherwise be
    // matchable by unrelated `getByLabel`/`getByRole(..., { name })` queries
    // elsewhere on the page, which is exactly what broke in production for a
    // resource URI template containing "{owner}".
    expect(display[0].parentElement).not.toHaveAttribute("aria-label");
  });

  it("middle-truncates long values and exposes the full value via a visually-hidden span", () => {
    const longValue = "abcdefghijklmnopqrstuvwxyz0123456789";
    render(<TruncatedMiddleText value={longValue} maxLength={24} />);

    // The truncated display text is a different string, so this uniquely
    // matches the visually-hidden span carrying the full value.
    const hidden = screen.getByText(longValue);
    expect(hidden).toHaveClass("sr-only");
    expect(hidden.parentElement).not.toHaveAttribute("aria-label");
  });

  it("shows a tooltip with the full value on hover when truncated", async () => {
    const user = userEvent.setup();
    const longValue = "abcdefghijklmnopqrstuvwxyz0123456789";
    render(<TruncatedMiddleText value={longValue} maxLength={24} />);

    const trigger = screen.getByText(longValue).parentElement;
    expect(trigger).not.toBeNull();
    await user.hover(trigger!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longValue);
  });

  it("does not show a tooltip for values that already fit", async () => {
    const user = userEvent.setup();
    render(<TruncatedMiddleText value="p-1" />);

    const trigger = screen.getByText("p-1").parentElement;
    expect(trigger).not.toBeNull();
    await user.hover(trigger!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
