import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PendingInvitationsProvider, usePendingInvitations } from "./PendingInvitationsProvider";
import type { TeamInvitation } from "@/types/team";

vi.mock("@/api/invitations", () => ({
  listMyInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { listMyInvitations, acceptInvitation } from "@/api/invitations";

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
const two = makeInvitation({ id: "inv-2", team_name: "Design Team", token: "tok-2" });

/** A minimal trigger, standing in for whatever surface a page renders. */
function Trigger({ name }: { name: string }) {
  const { count, open } = usePendingInvitations();
  if (count === 0) return null;
  return (
    <button type="button" onClick={() => open()}>
      {name}: {count}
    </button>
  );
}

describe("PendingInvitationsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMyInvitations).mockResolvedValue([one, two]);
    vi.mocked(acceptInvitation).mockResolvedValue({
      user_email: "invitee@example.com",
      role: "member",
      joined_at: "2026-09-11T10:00:00Z",
    });
  });

  it("makes no request when no consumer is mounted", async () => {
    renderWithProviders(
      <PendingInvitationsProvider>
        <p>A page with no invitations trigger</p>
      </PendingInvitationsProvider>,
    );

    await screen.findByText("A page with no invitations trigger");
    expect(listMyInvitations).not.toHaveBeenCalled();
  });

  it("fetches once however many consumers are mounted", async () => {
    renderWithProviders(
      <PendingInvitationsProvider>
        <Trigger name="toolbar" />
        <Trigger name="header" />
        <Trigger name="home" />
      </PendingInvitationsProvider>,
    );

    await screen.findByText("toolbar: 2");
    expect(screen.getByText("header: 2")).toBeInTheDocument();
    expect(screen.getByText("home: 2")).toBeInTheDocument();
    expect(listMyInvitations).toHaveBeenCalledTimes(1);
  });

  it("decrements every consumer's count when one invitation resolves", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PendingInvitationsProvider>
        <Trigger name="toolbar" />
        <Trigger name="header" />
      </PendingInvitationsProvider>,
    );

    await user.click(await screen.findByText("toolbar: 2"));
    await user.click(await screen.findByRole("button", { name: "Join Platform Team" }));

    await waitFor(() => expect(screen.getByText("toolbar: 1")).toBeInTheDocument());
    expect(screen.getByText("header: 1")).toBeInTheDocument();
  });

  it("refetches when the dialog is opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PendingInvitationsProvider>
        <Trigger name="toolbar" />
      </PendingInvitationsProvider>,
    );

    await user.click(await screen.findByText("toolbar: 2"));

    await waitFor(() => expect(listMyInvitations).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("returns focus to the opener on close", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PendingInvitationsProvider>
        <Trigger name="toolbar" />
      </PendingInvitationsProvider>,
    );

    const trigger = await screen.findByText("toolbar: 2");
    await user.click(trigger);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("falls back to the main landmark when the opener has unmounted", async () => {
    const user = userEvent.setup();
    vi.mocked(listMyInvitations).mockResolvedValue([one]);
    renderWithProviders(
      <main>
        <PendingInvitationsProvider>
          <Trigger name="toolbar" />
        </PendingInvitationsProvider>
      </main>,
    );

    await user.click(await screen.findByText("toolbar: 1"));
    // Resolving the last invitation drops the count to 0, unmounting the trigger.
    await user.click(await screen.findByRole("button", { name: "Join Platform Team" }));
    await waitFor(() => expect(screen.queryByText("toolbar: 1")).not.toBeInTheDocument());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });
});

describe("usePendingInvitations without a provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports no invitations and does not throw", async () => {
    renderWithProviders(<Trigger name="orphan" />);

    await waitFor(() => expect(listMyInvitations).not.toHaveBeenCalled());
    expect(screen.queryByText(/orphan/)).not.toBeInTheDocument();
  });
});
