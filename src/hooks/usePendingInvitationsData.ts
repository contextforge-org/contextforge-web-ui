/**
 * Data and mutations for the invitations addressed to the current user.
 *
 * Consumed by PendingInvitationsProvider, which mounts exactly one instance.
 * Exported for tests and for the unlikely case of a surface needing an
 * isolated copy: a second accidental instance holds its own resolutions, which
 * is the divergent-count bug the provider exists to prevent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { acceptInvitation, declineInvitation, listMyInvitations } from "@/api/invitations";
import type { TeamInvitation } from "@/types/team";
import type { InvitationAction, InvitationResolution } from "@/types/invitation";
import { sanitizeError } from "@/utils/errors";

export interface UsePendingInvitationsDataOptions {
  /**
   * Whether to fetch. The provider ties this to a mounted consumer, so pages
   * with no trigger make no request.
   */
  enabled?: boolean;
}

export interface UsePendingInvitationsDataResult {
  invitations: TeamInvitation[];
  /** Per-invitation outcome, keyed by invitation id. Absent means still actionable. */
  resolutions: Record<string, InvitationResolution>;
  /** Which request is open against each invitation, keyed by invitation id. */
  inFlight: Record<string, InvitationAction>;
  /** Invitations with no resolution yet. Drives every count in the app. */
  pendingCount: number;
  /** Increments on each successful accept. Surfaces effect on this to refetch. */
  acceptedCount: number;
  isLoading: boolean;
  error: string | null;
  accept: (invitation: TeamInvitation) => Promise<void>;
  decline: (invitation: TeamInvitation) => Promise<void>;
  refetch: () => Promise<void>;
}

export function usePendingInvitationsData({
  enabled = true,
}: UsePendingInvitationsDataOptions = {}): UsePendingInvitationsDataResult {
  const intl = useIntl();
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, InvitationResolution>>({});
  const [inFlight, setInFlight] = useState<Record<string, InvitationAction>>({});
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Concurrent loads share state, so only the latest-issued one may publish it.
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await listMyInvitations();
      if (requestId !== latestRequestId.current) return;
      setInvitations(result);
      // Resolved invitations are gone from the server response, so drop the
      // resolutions that went with them rather than accumulating them.
      const returnedIds = new Set(result.map((invitation) => invitation.id));
      setResolutions((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([id]) => returnedIds.has(id))),
      );
    } catch (err) {
      if (requestId !== latestRequestId.current) return;
      setError(sanitizeError(err));
    } finally {
      if (requestId === latestRequestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    // Ignore a response that lands after this consumer is gone.
    return () => {
      latestRequestId.current += 1;
    };
  }, [enabled, load]);

  /**
   * Commits the outcome only once the server confirms it. Both actions are
   * irreversible and the dialog stays open, so an optimistic write would
   * visibly flip a row back on failure.
   */
  const resolve = useCallback(
    async (invitation: TeamInvitation, action: InvitationAction) => {
      setInFlight((previous) => ({ ...previous, [invitation.id]: action }));

      try {
        if (action === "accept") {
          await acceptInvitation(invitation.token);
          setResolutions((previous) => ({ ...previous, [invitation.id]: "accepted" }));
          setAcceptedCount((count) => count + 1);
        } else {
          await declineInvitation(invitation.token);
          setResolutions((previous) => ({ ...previous, [invitation.id]: "declined" }));
        }
      } catch (err) {
        toast.error(
          intl.formatMessage({
            id: action === "accept" ? "invitations.error.accept" : "invitations.error.decline",
          }),
          { description: sanitizeError(err) },
        );
      } finally {
        setInFlight((previous) => {
          const next = { ...previous };
          delete next[invitation.id];
          return next;
        });
      }
    },
    [intl],
  );

  const accept = useCallback(
    (invitation: TeamInvitation) => resolve(invitation, "accept"),
    [resolve],
  );

  const decline = useCallback(
    (invitation: TeamInvitation) => resolve(invitation, "decline"),
    [resolve],
  );

  const pendingCount = useMemo(
    () => invitations.filter((invitation) => !resolutions[invitation.id]).length,
    [invitations, resolutions],
  );

  return {
    invitations,
    resolutions,
    inFlight,
    pendingCount,
    acceptedCount,
    isLoading,
    error,
    accept,
    decline,
    refetch: load,
  };
}
