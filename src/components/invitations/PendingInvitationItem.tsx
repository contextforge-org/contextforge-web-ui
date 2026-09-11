/**
 * One pending team invitation: the sentence describing it, and either its two
 * actions or the outcome that replaced them. Presentational, usable outside
 * the dialog.
 */
import type { Ref } from "react";
import { useIntl } from "react-intl";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TeamInvitation } from "@/types/team";
import type { InvitationAction, InvitationResolution } from "@/types/invitation";

/** `role` is a free string; anything unmapped renders as-is. */
const ROLE_MESSAGE_IDS: Record<string, string> = {
  owner: "invitations.role.owner",
  member: "invitations.role.member",
};

export interface PendingInvitationItemProps {
  invitation: TeamInvitation;
  /** Undefined while the invitation is still actionable. */
  resolution?: InvitationResolution;
  /** Which of the two actions has a request in flight, if either. */
  busyAction?: InvitationAction;
  onAccept: (invitation: TeamInvitation) => void;
  onDecline: (invitation: TeamInvitation) => void;
  /** Lets the dialog move focus here when the row above it resolves. */
  acceptButtonRef?: Ref<HTMLButtonElement>;
  className?: string;
}

export function PendingInvitationItem({
  invitation,
  resolution,
  busyAction,
  onAccept,
  onDecline,
  acceptButtonRef,
  className,
}: PendingInvitationItemProps) {
  const intl = useIntl();

  const roleMessageId = ROLE_MESSAGE_IDS[invitation.role?.toLowerCase() ?? ""];
  const role = roleMessageId ? intl.formatMessage({ id: roleMessageId }) : invitation.role;

  const isBusy = busyAction !== undefined;

  return (
    // A block, not an <li>: the dialog supplies the list markup.
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="px-4 text-sm text-foreground">
        {intl.formatMessage(
          { id: "invitations.sentence" },
          { inviter: invitation.invited_by, team: invitation.team_name, role },
        )}
      </p>

      {resolution ? (
        <div className="flex items-center justify-end gap-1.5 px-4 text-xs font-medium">
          {resolution === "accepted" ? (
            <>
              <CircleCheck aria-hidden="true" className="size-4" />
              <span>{intl.formatMessage({ id: "invitations.status.accepted" })}</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {intl.formatMessage({ id: "invitations.status.declined" })}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-4 px-4">
          <Button
            variant="outline"
            size="xs"
            className="shadow-none"
            disabled={isBusy}
            onClick={() => onDecline(invitation)}
            aria-label={intl.formatMessage(
              { id: "invitations.action.decline.aria" },
              { team: invitation.team_name },
            )}
          >
            {intl.formatMessage({
              id:
                busyAction === "decline"
                  ? "invitations.action.declining"
                  : "invitations.action.decline",
            })}
          </Button>
          <Button
            ref={acceptButtonRef}
            variant="default"
            size="xs"
            disabled={isBusy}
            onClick={() => onAccept(invitation)}
            aria-label={intl.formatMessage(
              { id: "invitations.action.accept.aria" },
              { team: invitation.team_name },
            )}
          >
            {intl.formatMessage({
              id:
                busyAction === "accept"
                  ? "invitations.action.accepting"
                  : "invitations.action.accept",
            })}
          </Button>
        </div>
      )}
    </div>
  );
}
