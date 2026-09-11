import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PendingInvitationsDialog } from "./PendingInvitationsDialog";
import type { PendingInvitationsDialogProps } from "./PendingInvitationsDialog";
import type { TeamInvitation } from "@/types/team";

function makeInvitation(overrides: Partial<TeamInvitation> = {}): TeamInvitation {
  return {
    id: "inv-1",
    team_id: "team-1",
    team_name: "Platform Team",
    email: "invitee@example.com",
    role: "member",
    invited_by: "janet@example.com",
    invited_at: "2026-09-10T10:00:00Z",
    expires_at: "2026-09-17T10:00:00Z",
    token: "tok-1",
    is_active: true,
    is_expired: false,
    ...overrides,
  };
}

const one = makeInvitation();
const two = makeInvitation({ id: "inv-2", team_id: "team-2", team_name: "Design Team" });

function renderDialog(props: Partial<PendingInvitationsDialogProps> = {}) {
  const onOpenChange = vi.fn();
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  const result = renderWithProviders(
    <PendingInvitationsDialog
      open
      onOpenChange={onOpenChange}
      invitations={[one]}
      resolutions={{}}
      inFlight={{}}
      isLoading={false}
      error={null}
      onAccept={onAccept}
      onDecline={onDecline}
      {...props}
    />,
  );

  function rerenderWith(next: Partial<PendingInvitationsDialogProps>) {
    result.rerender(
      <PendingInvitationsDialog
        open
        onOpenChange={onOpenChange}
        invitations={[one]}
        resolutions={{}}
        inFlight={{}}
        isLoading={false}
        error={null}
        onAccept={onAccept}
        onDecline={onDecline}
        {...props}
        {...next}
      />,
    );
  }

  return { onOpenChange, onAccept, onDecline, rerenderWith, ...result };
}

describe("PendingInvitationsDialog", () => {
  it("titles the dialog in the singular for one invitation", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Join team");
  });

  it("titles the dialog in the plural for several invitations", () => {
    renderDialog({ invitations: [one, two] });

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Join teams");
  });

  it("describes the dialog with a count summary", () => {
    renderDialog({ invitations: [one, two] });

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "You have 2 pending team invitations",
    );
  });

  it("renders one list item per invitation with a separator between but not after", () => {
    const { container } = renderDialog({ invitations: [one, two] });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.ownerDocument.querySelectorAll('[data-slot="separator"]')).toHaveLength(1);
  });

  it("shows a spinner while loading and no invitations", () => {
    renderDialog({ isLoading: true, invitations: [] });

    expect(screen.getByRole("status", { busy: true })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the load error with a retry button", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderDialog({ error: "Server error. Please try again later.", invitations: [], onRetry });

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Server error. Please try again later.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("closes on Escape without resolving anything", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onAccept, onDecline } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it("moves focus to the next actionable row when one resolves", async () => {
    const { rerenderWith } = renderDialog({ invitations: [one, two] });

    rerenderWith({ invitations: [one, two], resolutions: { [one.id]: "accepted" } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Join Design Team" })).toHaveFocus(),
    );
  });

  it("moves focus to the close button when the last row resolves", async () => {
    const { rerenderWith } = renderDialog({ autoCloseDelayMs: 0 });

    rerenderWith({ resolutions: { [one.id]: "accepted" }, autoCloseDelayMs: 0 });

    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());
  });
});

describe("PendingInvitationsDialog auto-close", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays open while any invitation is still actionable", () => {
    const { onOpenChange, rerenderWith } = renderDialog({ invitations: [one, two] });

    rerenderWith({ invitations: [one, two], resolutions: { [one.id]: "accepted" } });
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("stays open while a request is still in flight, even with nothing pending", () => {
    const { onOpenChange, rerenderWith } = renderDialog({ invitations: [one, two] });

    rerenderWith({
      invitations: [one, two],
      resolutions: { [one.id]: "accepted", [two.id]: "declined" },
      inFlight: { [two.id]: "decline" },
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes itself once after the dwell when everything is resolved", () => {
    const { onOpenChange, rerenderWith } = renderDialog();

    rerenderWith({ resolutions: { [one.id]: "accepted" } });

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("announces the outcome before closing", () => {
    const { rerenderWith } = renderDialog();

    rerenderWith({ resolutions: { [one.id]: "accepted" } });

    expect(screen.getByText("All invitations resolved")).toBeInTheDocument();
  });

  it("cancels the dwell permanently on pointer entry", () => {
    const { onOpenChange, rerenderWith } = renderDialog();

    rerenderWith({ resolutions: { [one.id]: "accepted" } });
    // React synthesises onPointerEnter from pointerover, so dispatch that.
    fireEvent.pointerOver(screen.getByRole("dialog"));

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("never closes itself when the dwell is disabled", () => {
    const { onOpenChange, rerenderWith } = renderDialog({ autoCloseDelayMs: 0 });

    rerenderWith({ resolutions: { [one.id]: "accepted" }, autoCloseDelayMs: 0 });
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("fires no state update when unmounted mid-dwell", () => {
    const { onOpenChange, rerenderWith, unmount } = renderDialog();

    rerenderWith({ resolutions: { [one.id]: "accepted" } });
    unmount();
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
