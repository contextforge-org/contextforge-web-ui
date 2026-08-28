import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import type { ToolInvokeState } from "@/hooks/useToolInvoke";
import { ToolLiveInvokeResult } from "./ToolLiveInvokeResult";

function invokeProps(
  overrides: Partial<Pick<ToolInvokeState, "result" | "error" | "hasRun">>,
): Pick<ToolInvokeState, "result" | "error" | "hasRun"> {
  return {
    result: null,
    error: null,
    hasRun: false,
    ...overrides,
  };
}

describe("ToolLiveInvokeResult", () => {
  it("renders nothing before the first run", () => {
    const { container } = render(<ToolLiveInvokeResult invoke={invokeProps({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders live invoke success through the tool result renderer", async () => {
    const user = userEvent.setup();
    render(
      <ToolLiveInvokeResult
        invoke={invokeProps({
          hasRun: true,
          result: {
            id: "invoke-1",
            status: 200,
            renderTimeMs: 14,
            result: {
              content: [{ type: "text", text: "live result", mimeType: "text/plain" }],
              structured_output: { total: 1 },
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Live invoke 200")).toBeInTheDocument();
    expect(screen.getByText("14 ms")).toBeInTheDocument();
    expect(screen.getByText("Tool result")).toBeInTheDocument();
    expect(screen.getByText("live result")).toBeInTheDocument();
    expect(screen.getByText("Structured output")).toBeInTheDocument();
    expect(screen.getByText("Raw live response")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Raw live response" }));

    expect(screen.getByLabelText("Copy raw live response")).toBeVisible();
  });

  it("renders JSON-RPC errors with their code", () => {
    render(
      <ToolLiveInvokeResult
        invoke={invokeProps({
          hasRun: true,
          error: { code: -32003, message: "Access denied", renderTimeMs: 8, status: null },
        })}
      />,
    );

    expect(screen.getByText("Live invoke failed -32003")).toBeInTheDocument();
    expect(screen.getByText("8 ms")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
  });

  it("renders optional request and backing gateway context", () => {
    render(
      <ToolLiveInvokeResult
        context={{ requestName: "Developer tools" }}
        invoke={invokeProps({
          hasRun: true,
          result: {
            id: "invoke-1",
            status: 200,
            renderTimeMs: 11,
            result: {
              target: { kind: "federated", gateway_name: "github-mcp" },
              content: [{ type: "text", text: "live result", mimeType: "text/plain" }],
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Requested through Developer tools")).toBeInTheDocument();
    expect(screen.getByText("Answered by github-mcp")).toBeInTheDocument();
  });

  it("renders HTTP errors and tool-level error results", () => {
    const { rerender } = render(
      <ToolLiveInvokeResult
        invoke={invokeProps({
          hasRun: true,
          error: { status: 403, renderTimeMs: 3, message: "Forbidden" },
        })}
      />,
    );

    expect(screen.getByText("Live invoke failed 403")).toBeInTheDocument();
    expect(screen.getByText("Forbidden")).toBeInTheDocument();

    rerender(
      <ToolLiveInvokeResult
        invoke={invokeProps({
          hasRun: true,
          result: {
            id: "invoke-2",
            status: 200,
            renderTimeMs: 5,
            result: {
              content: [{ type: "text", text: "tool failed", mimeType: "text/plain" }],
              isError: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Live invoke 200")).toBeInTheDocument();
    expect(screen.getByText("Error response")).toBeInTheDocument();
    expect(screen.getByText("tool failed")).toBeInTheDocument();
  });
});
