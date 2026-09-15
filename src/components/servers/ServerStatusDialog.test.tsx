import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "@/test/test-utils";
import { ServerStatusDialog } from "./ServerStatusDialog";

function renderDialog(props: Partial<Parameters<typeof ServerStatusDialog>[0]> = {}) {
  return renderWithProviders(
    <ServerStatusDialog
      open
      onOpenChange={vi.fn()}
      serverName="github-notify"
      availability="auth"
      {...props}
    />,
  );
}

describe("ServerStatusDialog", () => {
  it("names the state and the server", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Authorization needed" })).toBeInTheDocument();
    expect(screen.getByText("github-notify")).toBeInTheDocument();
  });

  it("shows the last error and last response only when present", () => {
    const { unmount } = renderDialog({
      availability: "unreachable",
      lastSeen: "2026-04-16T13:23:12Z",
      lastError: "connection refused",
    });
    expect(screen.getByText(/connection refused/)).toBeInTheDocument();
    expect(screen.getByText(/Last response:/)).toBeInTheDocument();
    unmount();

    renderDialog({ availability: "unreachable" });
    expect(screen.queryByText(/Last error:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last response:/)).not.toBeInTheDocument();
  });

  it("offers each state only the action that clears it", () => {
    const handlers = { onAuthorize: vi.fn(), onEnable: vi.fn() };
    const { unmount } = renderDialog({ availability: "auth", ...handlers });
    expect(screen.getByRole("button", { name: "Authorize" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn on" })).not.toBeInTheDocument();
    unmount();

    renderDialog({ availability: "inactive", ...handlers });
    expect(screen.getByRole("button", { name: "Turn on" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize" })).not.toBeInTheDocument();
  });

  it("offers no action when the caller cannot act", () => {
    renderDialog({ availability: "auth" });
    expect(screen.queryByRole("button", { name: "Authorize" })).not.toBeInTheDocument();
  });

  it("explains an unreachable server without offering a fix", () => {
    renderDialog({ availability: "unreachable", onAuthorize: vi.fn(), onEnable: vi.fn() });
    expect(screen.queryByRole("button", { name: "Authorize" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn on" })).not.toBeInTheDocument();
  });

  it("closes once the action succeeds", async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onAuthorize: vi.fn().mockResolvedValue(undefined), onOpenChange });

    await userEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the dialog open and reports a failed action", async () => {
    const onOpenChange = vi.fn();
    renderDialog({
      onAuthorize: vi.fn().mockRejectedValue(new Error("popup blocked")),
      onOpenChange,
    });

    await userEvent.click(screen.getByRole("button", { name: "Authorize" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("popup blocked");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
