import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LiveInvokeInfoPopover } from "./LiveInvokeInfoPopover";
import { renderWithProviders, screen } from "@/test/test-utils";

describe("LiveInvokeInfoPopover", () => {
  it("renders a focusable info trigger", () => {
    renderWithProviders(<LiveInvokeInfoPopover />);

    expect(screen.getByRole("button", { name: "About invocation modes" })).toBeInTheDocument();
  });

  it("explains what preview and live invocation each do when opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiveInvokeInfoPopover />);

    await user.click(screen.getByRole("button", { name: "About invocation modes" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Labeled to match its trigger, per WCAG.
    expect(dialog).toHaveAccessibleName("About invocation modes");
    expect(screen.getByText(/^Preview: checks your arguments/)).toBeInTheDocument();
    expect(screen.getByText(/^Live invocation: sends the call/)).toBeInTheDocument();
  });

  it("describes only the active mode when live invocation is on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiveInvokeInfoPopover mode="live" />);

    await user.click(screen.getByRole("button", { name: "About invocation modes" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/^Live invocation is active\./)).toBeInTheDocument();
    expect(screen.queryByText(/^Preview: checks your arguments/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Live invocation: sends the call/)).not.toBeInTheDocument();
  });

  it("dismisses on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiveInvokeInfoPopover />);

    await user.click(screen.getByRole("button", { name: "About invocation modes" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
