import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import { ToolPreviewResult } from "./ToolPreviewResult";
import type { ToolPreviewState } from "@/hooks/useToolPreview";
import type { ToolPreviewResponse } from "@/api/tools";
import { TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES } from "./toolResultContent";

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
    const { container } = render(
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
    expect(screen.getByLabelText("Copy raw preview response")).toBeVisible();
    expect(container.textContent).toContain('"resolved_arguments"');
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

  it("renders camelCase resolved arguments from the backend preview response", () => {
    const { container } = render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 4,
            preview: {
              validated: true,
              resolvedArguments: { customer_id: "acme-001" },
              target: { kind: "local", gatewayName: null },
              warnings: [],
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Resolved arguments")).toBeInTheDocument();
    expect(container.textContent).toContain('"customer_id"');
    expect(container.textContent).toContain('"acme-001"');
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

  it("renders localized fallback hook labels for elicitation warnings", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 0,
            preview: {
              warnings: [{ code: "elicitation_skipped" }],
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "Live invocation may request user input; preview skipped one or more hooks.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps large raw responses collapsed until requested", async () => {
    const user = userEvent.setup();
    const marker = "hidden raw marker";
    const preview = {
      debug: `${"x".repeat(TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES)} ${marker}`,
    } as unknown as ToolPreviewResponse;
    const { container } = render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 0,
            preview,
          },
        })}
      />,
    );

    expect(screen.getByText(/Large content hidden/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(marker);

    await user.click(screen.getByRole("button", { name: "View all" }));

    expect(container.textContent).toContain(marker);
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
