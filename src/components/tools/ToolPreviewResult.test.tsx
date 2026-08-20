import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders as render } from "@/test/test-utils";
import { ToolPreviewResult } from "./ToolPreviewResult";
import type { ToolPreviewState } from "@/hooks/useToolPreview";

function previewProps(
  overrides: Partial<Pick<ToolPreviewState, "result" | "error" | "hasRun">>,
): Pick<ToolPreviewState, "result" | "error" | "hasRun"> {
  return {
    result: null,
    error: null,
    hasRun: false,
    ...overrides,
  };
}

describe("ToolPreviewResult", () => {
  it("renders nothing before the first run", () => {
    const { container } = render(<ToolPreviewResult preview={previewProps({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders status, warnings, resolved arguments, and raw response for success", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 12,
            preview: {
              target: { kind: "federated", gateway_name: "github" },
              resolved_arguments: { query: "cloudflare" },
              content: [{ type: "text", text: "found issue", mimeType: "text/plain" }],
              warnings: [{ code: "elicitation_skipped", message: "approval skipped" }],
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Preview 200")).toBeInTheDocument();
    expect(screen.getByText("12 ms")).toBeInTheDocument();
    expect(screen.getByText("federated: github")).toBeInTheDocument();
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    expect(screen.getByText("approval skipped")).toBeInTheDocument();
    expect(screen.getByText("Tool result")).toBeInTheDocument();
    expect(screen.getByText("found issue")).toBeInTheDocument();
    expect(screen.getByText("Resolved arguments")).toBeInTheDocument();
    expect(screen.getByText("Raw preview response")).toBeInTheDocument();
  });

  it("renders API failures", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          error: { status: 422, renderTimeMs: 7, message: "missing query" },
        })}
      />,
    );

    expect(screen.getByText("Preview failed 422")).toBeInTheDocument();
    expect(screen.getByText("missing query")).toBeInTheDocument();
  });

  it("renders fallback warning labels and string targets", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 0,
            preview: {
              target: "local",
              warnings: [{ code: "schema_defaulted" }, {}],
            },
          },
        })}
      />,
    );

    expect(screen.getByText("local")).toBeInTheDocument();
    expect(screen.getByText("schema_defaulted")).toBeInTheDocument();
    expect(screen.getByText("Preview returned a warning")).toBeInTheDocument();
    expect(screen.queryByText("Resolved arguments")).not.toBeInTheDocument();
  });

  it("renders elicitation skipped warnings without backend messages", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 0,
            preview: {
              target: "local",
              warnings: [{ code: "elicitation_skipped", hooks: ["approval_hook"] }],
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText("Live invocation may request user input; preview skipped approval_hook."),
    ).toBeInTheDocument();
  });

  it("renders tool error results without treating the HTTP request as failed", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 5,
            preview: {
              content: [{ type: "text", text: "tool failed", mimeType: "text/plain" }],
              isError: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Preview 200")).toBeInTheDocument();
    expect(screen.getByText("Error response")).toBeInTheDocument();
    expect(screen.getByText("tool failed")).toBeInTheDocument();
  });

  it("renders generic failures without an HTTP status", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          error: { status: null, renderTimeMs: 0, message: "Network failed" },
        })}
      />,
    );

    expect(screen.getByText("Preview failed")).toBeInTheDocument();
    expect(screen.getByText("0 ms")).toBeInTheDocument();
    expect(screen.getByText("Network failed")).toBeInTheDocument();
  });

  it("formats object targets without a gateway name", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 3,
            preview: {
              target: { kind: "federated" },
            },
          },
        })}
      />,
    );

    expect(screen.getByText("federated")).toBeInTheDocument();
  });
});
