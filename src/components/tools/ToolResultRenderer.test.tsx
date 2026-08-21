import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import { ToolResultRenderer } from "./ToolResultRenderer";
import {
  TOOL_RESULT_BLOCK_COUNT_LIMIT,
  TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES,
  TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES,
} from "./toolResultContent";

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

  it("renders SVG text content inline as an image", () => {
    render(
      <ToolResultRenderer
        response={{
          content: [
            {
              type: "image",
              text: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
              mimeType: "image/svg+xml",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Tool result image 1" })).toHaveAttribute(
      "src",
      expect.stringContaining("data:image/svg+xml;charset=utf-8,"),
    );
    expect(screen.queryByText(/<svg/)).not.toBeInTheDocument();
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

  it("renders PDF content with open and download actions", () => {
    render(
      <ToolResultRenderer
        response={{
          content: [{ type: "blob", data: "JVBERi0=", mimeType: "application/pdf" }],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /Open in new tab/i })).toHaveAttribute(
      "href",
      "data:application/pdf;base64,JVBERi0=",
    );
    expect(screen.getByRole("link", { name: /Download raw/i })).toHaveAttribute(
      "download",
      "tool-result-1.pdf",
    );
  });

  it("renders URI-only resources without download actions", () => {
    render(
      <ToolResultRenderer
        response={{
          content: [{ type: "resource", uri: "file://reports/result.csv" }],
        }}
      />,
    );

    expect(screen.getByText("Resource URI")).toBeInTheDocument();
    expect(screen.getByText("file://reports/result.csv")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download raw/i })).not.toBeInTheDocument();
  });

  it("falls back to raw JSON for unknown content blocks", () => {
    const { container } = render(
      <ToolResultRenderer
        response={{
          content: [{ type: "custom", metadata: { fallback: true } }],
        }}
      />,
    );

    expect(container.textContent).toContain('"fallback": true');
  });

  it("renders structured output even when content is empty", () => {
    const { container } = render(
      <ToolResultRenderer response={{ structuredOutput: { status: "ok" } }} />,
    );

    expect(screen.getByText("Structured output")).toBeInTheDocument();
    expect(container.textContent).toContain('"status": "ok"');
  });

  it("returns nothing when the response has no renderable result", () => {
    const { container } = render(<ToolResultRenderer response={{ pre_hooks_run: [] }} />);

    expect(container.firstChild).toBeNull();
  });

  it("limits aggregate block rendering until requested", async () => {
    const user = userEvent.setup();
    const blocks = Array.from({ length: TOOL_RESULT_BLOCK_COUNT_LIMIT + 2 }, (_, index) => ({
      type: "text",
      text: `aggregate block ${index + 1}`,
      mimeType: "text/plain",
    }));
    const { container } = render(<ToolResultRenderer response={{ content: blocks }} />);

    expect(container.textContent).toContain(`aggregate block ${TOOL_RESULT_BLOCK_COUNT_LIMIT}`);
    expect(container.textContent).not.toContain(
      `aggregate block ${TOOL_RESULT_BLOCK_COUNT_LIMIT + 1}`,
    );
    expect(screen.getByText(/Showing 20 of 22 content blocks/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View all" }));

    expect(container.textContent).toContain(`aggregate block ${TOOL_RESULT_BLOCK_COUNT_LIMIT + 2}`);
  });

  it("keeps large structured output collapsed until requested", async () => {
    const user = userEvent.setup();
    const marker = "hidden structured marker";
    const { container } = render(
      <ToolResultRenderer
        response={{
          structuredOutput: {
            payload: `${"x".repeat(TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES)} ${marker}`,
          },
        }}
      />,
    );

    expect(screen.getByText(/Large content hidden/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(marker);

    await user.click(screen.getByRole("button", { name: "View all" }));

    expect(container.textContent).toContain(marker);
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

  it("resets block expansion state when a new preview response renders", () => {
    const smallResponse = {
      content: [{ type: "text", text: "small payload", mimeType: "text/plain" }],
    };
    const largeResponse = {
      content: [
        {
          type: "text",
          text: `${"x".repeat(TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES)} rerun hidden payload`,
          mimeType: "text/plain",
        },
      ],
    };
    const { container, rerender } = render(<ToolResultRenderer response={smallResponse} />);

    expect(container.textContent).toContain("small payload");

    rerender(<ToolResultRenderer response={largeResponse} />);

    expect(screen.getByText(/Large content hidden/)).toBeInTheDocument();
    expect(container.textContent).not.toContain("rerun hidden payload");
  });
});
