import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import { ToolPreviewResult } from "./ToolPreviewResult";
import type { ToolPreviewState } from "@/hooks/useToolPreview";
import type { ToolPreviewResponse, ToolPreviewWarning } from "@/api/tools";
import { TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES } from "./toolResultContent";

type PreviewBody = NonNullable<ToolPreviewResponse>;

function makePreviewResponse(overrides: Partial<PreviewBody> = {}): ToolPreviewResponse {
  return {
    validated: true,
    resolvedArguments: {},
    target: null,
    annotations: {},
    warnings: [],
    ...overrides,
  };
}

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
            preview: makePreviewResponse({
              target: { kind: "federated", gatewayName: "github" },
              resolvedArguments: { query: "cloudflare" },
              warnings: [{ code: "elicitation_skipped", message: "approval skipped" }],
            }),
          },
        })}
      />,
    );

    expect(screen.getByText("Preview 200")).toBeInTheDocument();
    expect(screen.getByText("12 ms")).toBeInTheDocument();
    expect(screen.getByText("federated: github")).toBeInTheDocument();
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    expect(screen.getByText("approval skipped")).toBeInTheDocument();
    expect(screen.getByText("Resolved arguments")).toBeInTheDocument();
    expect(screen.getByText("Raw preview response")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy raw preview response")).toBeVisible();
    expect(container.textContent).toContain('"resolvedArguments"');
    expect(container.textContent).toContain('"cloudflare"');
  });

  it("renders a warning status when the backend reports invalid arguments", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 5,
            preview: makePreviewResponse({ validated: false }),
          },
        })}
      />,
    );

    expect(screen.getByText("Preview 200 - arguments invalid")).toBeInTheDocument();
    expect(screen.queryByText("Preview 200")).not.toBeInTheDocument();
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
            preview: makePreviewResponse({
              resolvedArguments: { customer_id: "acme-001" },
              target: { kind: "local", gatewayName: null },
            }),
          },
        })}
      />,
    );

    expect(screen.getByText("Resolved arguments")).toBeInTheDocument();
    expect(container.textContent).toContain('"customer_id"');
    expect(container.textContent).toContain('"acme-001"');
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

  it("falls back to a localized generic warning when the backend omits a message", () => {
    // Backend guarantees `message`, but the formatter is defensive about an HTTP
    // boundary sending malformed data — simulate that here.
    const warning = { code: "schema_defaulted" } as unknown as ToolPreviewWarning;
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 0,
            preview: makePreviewResponse({ warnings: [warning] }),
          },
        })}
      />,
    );

    expect(screen.getByText("schema_defaulted")).toBeInTheDocument();
  });

  it("falls back to a localized elicitation-skipped message naming the hook", () => {
    const warning = {
      code: "elicitation_skipped",
      hook: "approval_hook",
    } as unknown as ToolPreviewWarning;
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 0,
            preview: makePreviewResponse({ warnings: [warning] }),
          },
        })}
      />,
    );

    expect(
      screen.getByText("Live invocation may request user input; preview skipped approval_hook."),
    ).toBeInTheDocument();
  });

  it("falls back to an unspecified-hooks label when neither message nor hook is present", () => {
    const warning = { code: "elicitation_skipped" } as unknown as ToolPreviewWarning;
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 0,
            preview: makePreviewResponse({ warnings: [warning] }),
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

  it("formats object targets without a gateway name", () => {
    render(
      <ToolPreviewResult
        preview={previewProps({
          hasRun: true,
          result: {
            status: 200,
            renderTimeMs: 3,
            preview: makePreviewResponse({ target: { kind: "federated" } }),
          },
        })}
      />,
    );

    expect(screen.getByText("federated")).toBeInTheDocument();
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
});
