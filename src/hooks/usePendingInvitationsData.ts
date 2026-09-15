/**
 * Data and mutations for the invitations addressed to the current user.
 *
 * Mount one instance only. Each holds its own resolutions, so a second one
 * leaves both counts disagreeing. PendingInvitationsProvider owns it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { acceptInvitation, declineInvitation, listMyInvitations } from "@/api/invitations";
import type { TeamInvitation } from "@/types/team";
import type { InvitationAction, InvitationResolution } from "@/types/invitation";
import { sanitizeError } from "@/utils/errors";

/** How stale a list may be before the tab regaining focus refetches it. */
const STALE_AFTER_MS = 60_000;

/** is_expired is the server's reading at serialisation, so recheck the date. */
function isActionable(invitation: TeamInvitation): boolean {
  return !invitation.is_expired && Date.parse(invitation.expires_at) > Date.now();
}

export interface UsePendingInvitationsDataOptions {
  /** Whether to fetch. The provider ties this to having a mounted consumer. */
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
  // Latest values for load(), which stays stable so effects can depend on it.
  const resolutionsRef = useRef(resolutions);
  resolutionsRef.current = resolutions;
  const inFlightRef = useRef(inFlight);
  inFlightRef.current = inFlight;

  const lastLoadStartedAt = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    const resolvedBefore = new Set(Object.keys(resolutionsRef.current));
    lastLoadStartedAt.current = Date.now();
    setIsLoading(true);
    setError(null);

    try {
      const result = await listMyInvitations();
      if (requestId !== latestRequestId.current) return;
      // A response that predates the user's own actions must not undo them: it
      // would drop the row they just resolved, along with its confirmation.
      const actedSince =
        Object.keys(inFlightRef.current).length > 0 ||
        Object.keys(resolutionsRef.current).some((id) => !resolvedBefore.has(id));
      if (actedSince) return;
      const actionable = result.filter(isActionable);
      setInvitations(actionable);
      // Drop resolutions for invitations no longer published.
      const returnedIds = new Set(actionable.map((invitation) => invitation.id));
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

  // The only other load runs on mount, so without this the list never refreshes.
  useEffect(() => {
    if (!enabled) return;

    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadStartedAt.current < STALE_AFTER_MS) return;
      void load();
    };

    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [enabled, load]);

  /**
   * Commits the outcome only once the server confirms it. Not optimistic: the
   * dialog stays open, so a rollback would visibly flip a resolved row back.
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
