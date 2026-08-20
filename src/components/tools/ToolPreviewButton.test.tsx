import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import { ToolPreviewButton } from "./ToolPreviewButton";

describe("ToolPreviewButton", () => {
  it("renders the initial preview state and runs on click", async () => {
    const user = userEvent.setup();
    const run = vi.fn();

    render(<ToolPreviewButton preview={{ run, isLoading: false, hasRun: false }} />);

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("renders the loading state and disables clicks", async () => {
    const user = userEvent.setup();
    const run = vi.fn();

    render(<ToolPreviewButton preview={{ run, isLoading: true, hasRun: false }} />);

    const button = screen.getByRole("button", { name: "Previewing..." });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it("renders the re-run state and respects external disablement", () => {
    render(
      <ToolPreviewButton preview={{ run: vi.fn(), isLoading: false, hasRun: true }} disabled />,
    );

    expect(screen.getByRole("button", { name: "Re-run" })).toBeDisabled();
  });
});
