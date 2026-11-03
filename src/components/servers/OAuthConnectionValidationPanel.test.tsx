import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { OAuthConnectionValidationPanel } from "./OAuthConnectionValidationPanel";
import type { OAuthConnectionValidationState } from "@/hooks/useOAuthConnectionValidation";

const props = { name: "Example", onTest: vi.fn(), onCancel: vi.fn(), onAuthorize: vi.fn() };
const success: OAuthConnectionValidationState = {
  state: "success",
  testedAt: Date.now(),
  result: {
    success: true,
    latencyMs: 2,
    stages: { token: "ok", negotiation: "ok", tools_list: "ok" },
    componentCounts: { tools: 0 },
  },
};

describe("OAuthConnectionValidationPanel", () => {
  it("waits for a click before testing", async () => {
    render(<OAuthConnectionValidationPanel {...props} />);
    expect(screen.queryByRole("status", { busy: true })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(props.onTest).toHaveBeenCalledOnce();
  });

  it("renders zero tools, stage text, test time and Retest", () => {
    render(<OAuthConnectionValidationPanel {...props} entry={success} />);
    expect(screen.getByText("0 tools")).toBeVisible();
    expect(screen.getByText("Token: Passed")).toBeVisible();
    expect(screen.getByText("MCP negotiation: Passed")).toBeVisible();
    expect(screen.getByText("Tools access: Passed")).toBeVisible();
    expect(screen.getByText(/Tested at/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Retest" })).toBeEnabled();
  });

  it("preserves first-page lower bounds", () => {
    render(
      <OAuthConnectionValidationPanel
        {...props}
        entry={{
          ...success,
          result: { ...success.result!, countsPartial: true, componentCounts: { tools: 2 } },
        }}
      />,
    );
    expect(screen.getByText("2+ tools")).toBeVisible();
  });

  it("announces a cancellable running test", async () => {
    render(<OAuthConnectionValidationPanel {...props} entry={{ state: "running" }} />);
    expect(screen.getByRole("status", { busy: true })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalled();
  });

  it.each(["token", "negotiation", "tools_list"] as const)(
    "shows a failed %s stage and reauthorization",
    async (stage) => {
      render(
        <OAuthConnectionValidationPanel
          {...props}
          entry={{
            state: "failure",
            errorCode: "insufficient_scope",
            result: {
              success: false,
              latencyMs: 1,
              stages: {
                token: "skipped",
                negotiation: "skipped",
                tools_list: "skipped",
                [stage]: "failed",
              },
              reauthorizationRequired: true,
            },
          }}
        />,
      );
      expect(screen.getByText(/stored token lacks the required scope/)).toBeVisible();
      expect(screen.getByText(/: Failed$/)).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Authorize again" }));
      expect(props.onAuthorize).toHaveBeenCalled();
    },
  );

  it("uses generic guidance for unknown errors without displaying upstream secrets", () => {
    render(
      <OAuthConnectionValidationPanel
        {...props}
        entry={{
          state: "failure",
          errorCode: "secret-provider-code",
          result: { success: false, latencyMs: 1, error: "unsafe token" },
        }}
      />,
    );
    expect(screen.getByText(/Check the configuration and try again/)).toBeVisible();
    expect(screen.queryByText(/unsafe token|secret-provider-code/)).not.toBeInTheDocument();
  });
});
