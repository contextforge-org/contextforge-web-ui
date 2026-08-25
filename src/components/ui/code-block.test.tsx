import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { CodeBlock } from "./code-block";

describe("CodeBlock", () => {
  it("renders the supplied code", () => {
    render(<CodeBlock code='{"a":1}' language="json" />);
    expect(screen.getByText('"a"')).toBeInTheDocument();
  });

  it("copies the code to the clipboard and announces the copied status when the copy button is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CodeBlock code="hello world" language="bash" copyLabel="bash" />);
    await user.click(screen.getByRole("button", { name: /bash/i }));
    expect(writeText).toHaveBeenCalledWith("hello world");
    expect(screen.getByRole("status")).toHaveTextContent("Copied!");
  });

  it("hides the copy button when hideCopy is set", () => {
    render(<CodeBlock code="x" language="json" hideCopy />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to a generic aria-label when no copyLabel is supplied", () => {
    render(<CodeBlock code="x" language="json" />);
    expect(screen.getByRole("button", { name: /copy code/i })).toBeInTheDocument();
  });
});
