import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import { ToolResultRenderer } from "./ToolResultRenderer";
import { TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES } from "./toolResultContent";

describe("ToolResultRenderer", () => {
  it("renders text, JSON, structured output, and error badges", () => {
    const { container } = render(
      <ToolResultRenderer
        response={{
          content: [
            { type: "text", text: "plain result", mimeType: "text/plain" },
            { type: "text", text: '{"ok":true}', mimeType: "application/json" },
          ],
          structured_output: { total: 2 },
          isError: true,
        }}
      />,
    );

    expect(screen.getByText("Tool result")).toBeInTheDocument();
    expect(screen.getByText("Error response")).toBeInTheDocument();
    expect(screen.getByText("Content block 1")).toBeInTheDocument();
    expect(screen.getByText("Content block 2")).toBeInTheDocument();
    expect(screen.getByText("Structured output")).toBeInTheDocument();
    expect(container.textContent).toContain("plain result");
    expect(container.textContent).toContain('"ok": true');
    expect(container.textContent).toContain('"total": 2');
  });

  it("renders image content inline", () => {
    render(
      <ToolResultRenderer
        response={{
          content: [
            {
              type: "image",
              data: "iVBORw0KGgo=",
              mimeType: "image/png",
            },
          ],
        }}
      />,
    );

    const image = screen.getByRole("img", { name: "Tool result image 1" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    expect(screen.getAllByText(/image\/png/).length).toBeGreaterThan(0);
  });

  it("renders binary content as a download action", () => {
    render(
      <ToolResultRenderer
        response={{
          content: [{ type: "blob", data: "AAECAw==", mimeType: "application/octet-stream" }],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /Download raw/i })).toHaveAttribute(
      "href",
      "data:application/octet-stream;base64,AAECAw==",
    );
  });

  it("keeps large text collapsed until requested", async () => {
    const user = userEvent.setup();
    const hiddenText = `${"x".repeat(TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES)} hidden payload`;
    const { container } = render(
      <ToolResultRenderer
        response={{ content: [{ type: "text", text: hiddenText, mimeType: "text/plain" }] }}
      />,
    );

    expect(screen.getByText(/Large content hidden/)).toBeInTheDocument();
    expect(container.textContent).not.toContain("hidden payload");

    await user.click(screen.getByRole("button", { name: "View all" }));

    expect(container.textContent).toContain("hidden payload");
  });
});
