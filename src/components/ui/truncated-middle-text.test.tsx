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
  it("shows short values verbatim with no aria-label override", () => {
    render(<TruncatedMiddleText value="p-1" />);

    const span = screen.getByText("p-1");
    expect(span).not.toHaveAttribute("aria-label");
  });

  it("middle-truncates long values and exposes the full value via aria-label", () => {
    const longValue = "abcdefghijklmnopqrstuvwxyz0123456789";
    render(<TruncatedMiddleText value={longValue} maxLength={24} />);

    expect(screen.queryByText(longValue)).not.toBeInTheDocument();
    expect(screen.getByLabelText(longValue)).toBeInTheDocument();
  });

  it("shows a tooltip with the full value on hover when truncated", async () => {
    const user = userEvent.setup();
    const longValue = "abcdefghijklmnopqrstuvwxyz0123456789";
    render(<TruncatedMiddleText value={longValue} maxLength={24} />);

    await user.hover(screen.getByLabelText(longValue));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longValue);
  });

  it("does not show a tooltip for values that already fit", async () => {
    const user = userEvent.setup();
    render(<TruncatedMiddleText value="p-1" />);

    await user.hover(screen.getByText("p-1"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
