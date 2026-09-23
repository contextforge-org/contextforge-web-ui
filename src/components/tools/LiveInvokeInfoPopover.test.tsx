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

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/^Preview: checks your arguments/)).toBeInTheDocument();
    expect(screen.getByText(/^Live invocation: sends the call/)).toBeInTheDocument();
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
