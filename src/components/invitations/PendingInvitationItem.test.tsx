import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PendingInvitationItem } from "./PendingInvitationItem";
import type { PendingInvitationItemProps } from "./PendingInvitationItem";
import type { TeamInvitation } from "@/types/team";

const invitation: TeamInvitation = {
  id: "inv-1",
  team_id: "team-1",
  team_name: "Platform Team",
  email: "invitee@example.com",
  role: "owner",
  invited_by: "janet@example.com",
  invited_at: "2026-09-10T10:00:00Z",
  expires_at: "2026-09-17T10:00:00Z",
  token: "tok-1",
  is_active: true,
  is_expired: false,
};

function renderItem(props: Partial<PendingInvitationItemProps> = {}) {
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  const result = renderWithProviders(
    <PendingInvitationItem
      invitation={invitation}
      onAccept={onAccept}
      onDecline={onDecline}
      {...props}
    />,
  );
  return { onAccept, onDecline, ...result };
}

describe("PendingInvitationItem", () => {
  it("renders the inviter email, team and mapped role in one sentence", () => {
    renderItem();

    expect(
      screen.getByText("janet@example.com invited you to join Platform Team as an owner."),
    ).toBeInTheDocument();
  });

  it("falls back to the raw role for a role with no display name", () => {
    renderItem({ invitation: { ...invitation, role: "platform_admin" } });

    expect(
      screen.getByText("janet@example.com invited you to join Platform Team as platform_admin."),
    ).toBeInTheDocument();
  });

  it("offers both actions while unresolved and names the team in each label", () => {
    renderItem();

    expect(screen.getByRole("button", { name: "Join Platform Team" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Decline invitation to Platform Team" }),
    ).toBeEnabled();
  });

  it("calls onAccept and onDecline with the invitation", async () => {
    const user = userEvent.setup();
    const { onAccept, onDecline } = renderItem();

    await user.click(screen.getByRole("button", { name: "Join Platform Team" }));
    expect(onAccept).toHaveBeenCalledWith(invitation);

    await user.click(screen.getByRole("button", { name: "Decline invitation to Platform Team" }));
    expect(onDecline).toHaveBeenCalledWith(invitation);
  });

  it("disables both buttons and labels the acting one while a request is in flight", () => {
    renderItem({ busyAction: "accept" });

    expect(screen.getByRole("button", { name: "Join Platform Team" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Decline invitation to Platform Team" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Join Platform Team" })).toHaveTextContent(
      "Joining...",
    );
  });

  it("replaces the buttons with a green check and 'Invite accepted' once accepted", () => {
    const { container } = renderItem({ resolution: "accepted" });

    expect(screen.getByText("Invite accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveClass("text-success");
  });

  it("keeps the action row's height once resolved", () => {
    const { container: unresolved } = renderItem();
    const { container: accepted } = renderItem({ resolution: "accepted" });
    const { container: declined } = renderItem({ resolution: "declined" });

    const actionRow = (root: HTMLElement) => root.firstElementChild?.lastElementChild;

    expect(unresolved.querySelector("button")).toHaveClass("h-6");
    expect(actionRow(accepted)).toHaveClass("h-6");
    expect(actionRow(declined)).toHaveClass("h-6");
  });

  it("replaces the buttons with a muted, icon-less 'Declined' once declined", () => {
    const { container } = renderItem({ resolution: "declined" });

    expect(screen.getByText("Declined")).toHaveClass("text-muted-foreground");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("merges className onto the row", () => {
    const { container } = renderItem({ className: "pt-6" });

    expect(container.firstElementChild).toHaveClass("flex", "pt-6");
  });
});
