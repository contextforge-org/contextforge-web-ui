import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PendingInvitationsDialog } from "./PendingInvitationsDialog";
import type { PendingInvitationsDialogProps } from "./PendingInvitationsDialog";
import type { TeamInvitation } from "@/types/team";

const A_WEEK_FROM_NOW = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function makeInvitation(overrides: Partial<TeamInvitation> = {}): TeamInvitation {
  return {
    id: "inv-1",
    team_id: "team-1",
    team_name: "Platform Team",
    email: "invitee@example.com",
    role: "member",
    invited_by: "janet@example.com",
    invited_at: "2026-09-10T10:00:00Z",
    expires_at: A_WEEK_FROM_NOW,
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

  it("counts only what is still pending in the summary", () => {
    renderDialog({ invitations: [one, two], resolutions: { [one.id]: "accepted" } });

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "You have 1 pending team invitation",
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
    expect(within(alert).getByText("Failed to load your invitations")).toBeInTheDocument();
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

  it("announces the action in flight, naming the team", () => {
    renderDialog({ invitations: [one, two], inFlight: { [one.id]: "accept" } });

    expect(screen.getByRole("status")).toHaveTextContent("Joining Platform Team");
  });

  it("announces a decline in flight, naming the team", () => {
    renderDialog({ invitations: [one, two], inFlight: { [two.id]: "decline" } });

    expect(screen.getByRole("status")).toHaveTextContent("Declining invitation to Design Team");
  });

  it("announces one row resolving while others stay actionable", () => {
    const { rerenderWith } = renderDialog({ invitations: [one, two] });

    rerenderWith({ invitations: [one, two], resolutions: { [two.id]: "declined" } });

    expect(screen.getByRole("status")).toHaveTextContent("Design Team: Declined");
  });

  it("announces both rows when two requests are open at once", () => {
    renderDialog({
      invitations: [one, two],
      inFlight: { [one.id]: "accept", [two.id]: "decline" },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Joining Platform Team. Declining invitation to Design Team",
    );
  });

  it("announces an outcome that lands while another request is still open", () => {
    const { rerenderWith } = renderDialog({
      invitations: [one, two],
      inFlight: { [one.id]: "accept", [two.id]: "decline" },
    });

    rerenderWith({
      invitations: [one, two],
      inFlight: { [two.id]: "decline" },
      resolutions: { [one.id]: "accepted" },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Declining invitation to Design Team. Platform Team: Invite accepted",
    );
  });

  it("announces every outcome when two resolutions arrive together", () => {
    const { rerenderWith } = renderDialog({ invitations: [one, two] });

    rerenderWith({
      invitations: [one, two],
      resolutions: { [one.id]: "accepted", [two.id]: "declined" },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Platform Team: Invite accepted. Design Team: Declined",
    );
  });

  it("announces nothing while everything is still actionable", () => {
    renderDialog({ invitations: [one, two] });

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("moves focus to the next actionable row when one resolves", async () => {
    const { rerenderWith } = renderDialog({ invitations: [one, two] });

    rerenderWith({ invitations: [one, two], resolutions: { [one.id]: "accepted" } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Join team: Design Team" })).toHaveFocus(),
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

  it("announces the outcome and the completion before closing", () => {
    const { rerenderWith } = renderDialog();

    rerenderWith({ resolutions: { [one.id]: "accepted" } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Platform Team: Invite accepted. All invitations resolved",
    );
  });

  it("cancels the dwell permanently on pointer movement during it", () => {
    const { onOpenChange, rerenderWith } = renderDialog();

    rerenderWith({ resolutions: { [one.id]: "accepted" } });
    fireEvent.pointerMove(screen.getByRole("dialog"));

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("cancels the dwell permanently on a key press during it", () => {
    const { onOpenChange, rerenderWith } = renderDialog();

    rerenderWith({ resolutions: { [one.id]: "accepted" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("still closes itself after a mouse click resolved the last invitation", () => {
    const { onOpenChange, rerenderWith } = renderDialog();

    // Clicking Join puts the cursor inside the dialog and moves it on the way,
    // which must not count against a dwell that has not started yet.
    const join = screen.getByRole("button", { name: "Join team: Platform Team" });
    fireEvent.pointerMove(join);
    fireEvent.pointerOver(join);
    fireEvent.click(join);

    rerenderWith({ resolutions: { [one.id]: "accepted" } });
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
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
