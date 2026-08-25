import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { TruncatedText } from "./truncated-text";

/** jsdom never lays anything out, so scrollWidth/clientWidth are both 0 by
 * default; stub them to simulate a clipped or unclipped element. */
function mockOverflow(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
}

describe("TruncatedText", () => {
  afterEach(() => {
    mockOverflow(0, 0);
  });

  it("applies the truncate class and merges a custom className", () => {
    render(<TruncatedText className="text-xs">value</TruncatedText>);

    const span = screen.getByText("value");
    expect(span).toHaveClass("truncate", "text-xs");
  });

  it("forwards arbitrary props (e.g. aria-hidden, data-testid) to the span", () => {
    render(
      <TruncatedText aria-hidden="true" data-testid="name">
        value
      </TruncatedText>,
    );

    const span = screen.getByTestId("name");
    expect(span).toHaveAttribute("aria-hidden", "true");
  });

  it("does not show a tooltip when the text is not clipped", async () => {
    mockOverflow(50, 100);
    const user = userEvent.setup();
    render(<TruncatedText>short value</TruncatedText>);

    await user.hover(screen.getByText("short value"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows a tooltip with the full text when the text is clipped", async () => {
    mockOverflow(200, 100);
    const user = userEvent.setup();
    render(<TruncatedText>a very long value that gets clipped</TruncatedText>);

    await user.hover(screen.getByText("a very long value that gets clipped"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "a very long value that gets clipped",
    );
  });
});
