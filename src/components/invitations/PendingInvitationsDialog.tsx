/**
 * The single dialog listing every pending invitation. Presentational: it owns
 * no fetching and is rendered only by PendingInvitationsProvider.
 *
 * The confirmation dwell lives here rather than in the provider because the
 * dwell exists to let the confirmation be read, so it belongs with the
 * component that renders it.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PendingInvitationItem } from "./PendingInvitationItem";
import type { TeamInvitation } from "@/types/team";
import type { InvitationAction, InvitationResolution } from "@/types/invitation";

/**
 * Matches sonner's default toast duration, which `ui/sonner.tsx` leaves
 * unoverridden, so the app has one dwell for a confirmation rather than two.
 */
const DEFAULT_AUTO_CLOSE_MS = 4000;

export interface PendingInvitationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitations: TeamInvitation[];
  resolutions: Record<string, InvitationResolution>;
  inFlight: Record<string, InvitationAction>;
  isLoading: boolean;
  error: string | null;
  onAccept: (invitation: TeamInvitation) => void;
  onDecline: (invitation: TeamInvitation) => void;
  onRetry?: () => void;
  /**
   * How long the confirmation dwells after the last invitation resolves,
   * before the dialog closes itself. Pass 0 to disable.
   */
  autoCloseDelayMs?: number;
  /** Called when the dialog closes itself, so the opener can restore focus. */
  onCloseAutoFocus?: (event: Event) => void;
  className?: string;
}

export function PendingInvitationsDialog({
  open,
  onOpenChange,
  invitations,
  resolutions,
  inFlight,
  isLoading,
  error,
  onAccept,
  onDecline,
  onRetry,
  autoCloseDelayMs = DEFAULT_AUTO_CLOSE_MS,
  onCloseAutoFocus,
  className,
}: PendingInvitationsDialogProps) {
  const intl = useIntl();
  const summaryId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const acceptButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const pending = invitations.filter((invitation) => !resolutions[invitation.id]);
  const pendingCount = pending.length;
  const resolvedCount = invitations.length - pendingCount;
  const hasRequestInFlight = Object.keys(inFlight).length > 0;
  const allResolved = invitations.length > 0 && pendingCount === 0;

  // Pointer entry cancels the dwell outright rather than pausing it: a timer
  // that resumes on pointer exit closes at an unpredictable moment. Radix's
  // usual "pause while focus is inside" signal is unusable here because the
  // dialog traps focus, so the condition would never be false.
  const [dwellCancelled, setDwellCancelled] = useState(false);

  useEffect(() => {
    if (!open) setDwellCancelled(false);
  }, [open]);

  useEffect(() => {
    if (!open || dwellCancelled || autoCloseDelayMs <= 0) return;
    if (!allResolved || hasRequestInFlight) return;

    const timer = setTimeout(() => onOpenChange(false), autoCloseDelayMs);
    return () => clearTimeout(timer);
  }, [open, dwellCancelled, autoCloseDelayMs, allResolved, hasRequestInFlight, onOpenChange]);

  // A resolved row's buttons unmount, taking the focused element with them.
  const previousResolvedCount = useRef(resolvedCount);
  useEffect(() => {
    if (!open) {
      previousResolvedCount.current = resolvedCount;
      return;
    }
    if (resolvedCount > previousResolvedCount.current) {
      const next = pending[0];
      const target = next
        ? acceptButtonRefs.current.get(next.id)
        : contentRef.current?.querySelector<HTMLElement>('[data-slot="dialog-close"]');
      target?.focus();
    }
    previousResolvedCount.current = resolvedCount;
  }, [open, resolvedCount, pending]);

  const registerAcceptButton = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) {
      acceptButtonRefs.current.set(id, node);
    } else {
      acceptButtonRefs.current.delete(id);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        aria-describedby={summaryId}
        onPointerEnter={() => setDwellCancelled(true)}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn("gap-6 p-6", className)}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <div className="flex size-6 items-center justify-center rounded bg-team-icon-bg">
              <Bell aria-hidden="true" className="size-4 text-black" />
            </div>
            {intl.formatMessage({ id: "invitations.dialog.title" }, { count: invitations.length })}
          </DialogTitle>
        </DialogHeader>

        <p id={summaryId} className="sr-only">
          {intl.formatMessage(
            { id: "invitations.dialog.summary.sr" },
            { count: invitations.length },
          )}
        </p>

        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="flex items-center justify-center py-8"
          >
            <span className="sr-only">{intl.formatMessage({ id: "invitations.loading.sr" })}</span>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
          </div>
        ) : (
          <>
            {/* Above the list rather than instead of it: a refresh that fails
                should not take rows the user can still act on off the screen. */}
            {error && (
              <div
                role="alert"
                className="flex flex-col items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4"
              >
                <p className="text-sm text-destructive">{error}</p>
                {onRetry && (
                  <Button variant="outline" size="xs" onClick={onRetry}>
                    {intl.formatMessage({ id: "common.button.retry" })}
                  </Button>
                )}
              </div>
            )}
            {invitations.length > 0 && (
              <ul className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto scrollbar-thin">
                {invitations.map((invitation, index) => (
                  <li key={invitation.id} className="flex flex-col gap-6">
                    {index > 0 && <Separator />}
                    <PendingInvitationItem
                      invitation={invitation}
                      resolution={resolutions[invitation.id]}
                      busyAction={inFlight[invitation.id]}
                      onAccept={onAccept}
                      onDecline={onDecline}
                      acceptButtonRef={(node) => registerAcceptButton(invitation.id, node)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* One summary on the final resolution, rather than N queued row
            announcements racing the dwell. */}
        <div role="status" className="sr-only">
          {allResolved ? intl.formatMessage({ id: "invitations.status.allResolved.sr" }) : ""}
        </div>
      </DialogContent>
    </Dialog>
  );
}
