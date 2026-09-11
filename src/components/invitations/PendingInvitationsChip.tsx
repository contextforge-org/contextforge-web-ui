/**
 * The Settings > Teams trigger: a count of pending invitations that opens the
 * shared dialog.
 *
 * Deliberately not a Radix DialogTrigger. That would require every trigger to
 * be a descendant of the same Dialog, which forces either a dialog per trigger
 * or all triggers into one subtree, and neither survives a second surface.
 * Focus return is handled by the provider instead.
 */
import type { ReactNode, RefObject } from "react";
import { useIntl } from "react-intl";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePendingInvitations } from "./PendingInvitationsProvider";

export interface PendingInvitationsChipProps {
  /** Where to send focus on close if this chip has unmounted by then. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  /** Override the default "{count} invitations" label for a different surface. */
  label?: (count: number) => ReactNode;
  className?: string;
}

export function PendingInvitationsChip({
  fallbackFocusRef,
  label,
  className,
}: PendingInvitationsChipProps) {
  const intl = useIntl();
  // Called before the early return, so an unmounted-looking chip still counts
  // as the mounted consumer that enables the fetch.
  const { count, open } = usePendingInvitations();

  if (count === 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("h-auto gap-2 rounded p-2 shadow-none", className)}
      onClick={() => open(fallbackFocusRef)}
    >
      <div className="flex size-[17.5px] items-center justify-center rounded bg-team-icon-bg">
        <Bell aria-hidden="true" className="size-[11px] text-black" />
      </div>
      <span className="text-xs font-medium text-foreground">
        {label ? label(count) : intl.formatMessage({ id: "invitations.count" }, { count })}
      </span>
    </Button>
  );
}
