import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TruncatedDescription } from "./TruncatedDescription";
import { renderWithProviders, screen } from "@/test/test-utils";

describe("TruncatedDescription", () => {
  it("renders short text as-is, with no toggle", () => {
    renderWithProviders(<TruncatedDescription text="Short description." id="desc" />);

    expect(screen.getByText("Short description.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("clips long text and expands/collapses it via the Show more/less toggle", async () => {
    const user = userEvent.setup();
    const longText = "A fairly long sentence about what this thing does. ".repeat(6);

    renderWithProviders(<TruncatedDescription text={longText} id="desc" maxLength={80} />);

    const description = document.getElementById("desc");
    expect(description?.textContent).toContain("…");
    expect(description?.textContent).not.toContain(longText.trim());

    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "desc");

    await user.click(toggle);
    expect(description?.textContent).toContain(longText.trim());
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(description?.textContent).toContain("…");
  });
});
