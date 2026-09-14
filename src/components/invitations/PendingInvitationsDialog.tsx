/**
 * The single dialog listing every pending invitation. Presentational: it owns
 * no fetching and is rendered only by PendingInvitationsProvider.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PendingInvitationItem } from "./PendingInvitationItem";
import type { TeamInvitation } from "@/types/team";
import type { InvitationAction, InvitationResolution } from "@/types/invitation";

/** Sonner's default toast duration, so confirmations dwell alike. */
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

  // Pointer movement or a key press during the dwell cancels it for good.
  const [dwellCancelled, setDwellCancelled] = useState(false);
  const isDwelling = open && allResolved && !hasRequestInFlight && autoCloseDelayMs > 0;

  // Arming clears a stale cancel from before the confirmation appeared.
  useEffect(() => {
    if (!open || isDwelling) setDwellCancelled(false);
  }, [open, isDwelling]);

  const cancelDwell = useCallback(() => {
    if (isDwelling) setDwellCancelled(true);
  }, [isDwelling]);

  useEffect(() => {
    if (!isDwelling || dwellCancelled) return;

    const timer = setTimeout(() => onOpenChange(false), autoCloseDelayMs);
    return () => clearTimeout(timer);
  }, [isDwelling, dwellCancelled, autoCloseDelayMs, onOpenChange]);

  // Which row resolved last, so the announcement can name it.
  const [lastResolvedId, setLastResolvedId] = useState<string | null>(null);
  const previousResolutions = useRef(resolutions);
  useEffect(() => {
    const resolved = Object.keys(resolutions).find((id) => !previousResolutions.current[id]);
    previousResolutions.current = resolutions;
    if (resolved) setLastResolvedId(resolved);
  }, [resolutions]);

  useEffect(() => {
    if (!open) setLastResolvedId(null);
  }, [open]);

  const announcement = useMemo(() => {
    const teamOf = (id: string) => invitations.find((one) => one.id === id)?.team_name ?? "";
    const lines: string[] = [];

    const [actingId, action] = Object.entries(inFlight)[0] ?? [];
    const resolution = lastResolvedId ? resolutions[lastResolvedId] : undefined;

    if (actingId && action) {
      lines.push(
        intl.formatMessage(
          {
            id:
              action === "accept"
                ? "invitations.announce.accepting"
                : "invitations.announce.declining",
          },
          { team: teamOf(actingId) },
        ),
      );
    } else if (lastResolvedId && resolution) {
      lines.push(
        intl.formatMessage(
          { id: "invitations.announce.resolved" },
          {
            team: teamOf(lastResolvedId),
            status: intl.formatMessage({
              id:
                resolution === "accepted"
                  ? "invitations.status.accepted"
                  : "invitations.status.declined",
            }),
          },
        ),
      );
    }

    if (allResolved) lines.push(intl.formatMessage({ id: "invitations.status.allResolved.sr" }));

    return lines.join(". ");
  }, [inFlight, lastResolvedId, resolutions, invitations, allResolved, intl]);

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
        onPointerMove={cancelDwell}
        onKeyDown={cancelDwell}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn("gap-6 scrollbar-gutter-stable p-6 sm:rounded-[12px]", className)}
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
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="flex flex-col items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4"
              >
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">
                    {intl.formatMessage({ id: "invitations.error.load" })}
                  </h3>
                  <p className="text-sm text-destructive">{error}</p>
                </div>
                {onRetry && (
                  <Button variant="outline" size="xs" className="shadow-none" onClick={onRetry}>
                    {intl.formatMessage({ id: "common.button.retry" })}
                  </Button>
                )}
              </div>
            )}
            {invitations.length > 0 && (
              <ul className="flex flex-col gap-6">
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

        {/* Stays mounted: a region whose text changes is announced more
            reliably than one that mounts with its content. */}
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
      </DialogContent>
    </Dialog>
  );
}
