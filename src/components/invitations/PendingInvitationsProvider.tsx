/**
 * Owns the pending-invitation data for the whole app and mounts the single
 * dialog every trigger opens.
 *
 * One provider, one dialog, N triggers. Two mounted copies of a self-contained
 * component would hold separate resolutions, so resolving in one would leave
 * the other's count stale with nothing logged. The fetch is gated on a mounted
 * consumer, so pages with no trigger issue no request and pay nothing for it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import { usePendingInvitationsData } from "@/hooks/usePendingInvitationsData";
import { PendingInvitationsDialog } from "./PendingInvitationsDialog";

export interface PendingInvitationsContextValue {
  /** Invitations with nothing done to them yet. Triggers hide at 0. */
  count: number;
  isLoading: boolean;
  error: string | null;
  /**
   * Opens the shared dialog. `fallbackFocusRef` is where focus should go on
   * close if the invoking element has unmounted by then, which happens
   * whenever resolving the last invitation removes the trigger that opened it.
   */
  open: (fallbackFocusRef?: RefObject<HTMLElement | null>) => void;
  /** Increments on each successful accept, for surfaces that cache team data. */
  acceptedCount: number;
  /** Registers a mounted trigger; the returned callback unregisters it. */
  register: () => () => void;
}

/**
 * Defaults to an inert value rather than throwing, matching SettingsTabsContext,
 * so a page rendered in isolation in a test does not explode.
 */
const PendingInvitationsContext = createContext<PendingInvitationsContextValue>({
  count: 0,
  isLoading: false,
  error: null,
  open: () => {},
  acceptedCount: 0,
  register: () => () => {},
});

export function PendingInvitationsProvider({ children }: { children: ReactNode }) {
  const [consumerCount, setConsumerCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const openerRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRef = useRef<RefObject<HTMLElement | null> | null>(null);

  const {
    invitations,
    resolutions,
    inFlight,
    pendingCount,
    acceptedCount,
    isLoading,
    error,
    accept,
    decline,
    refetch,
  } = usePendingInvitationsData({ enabled: consumerCount > 0 });

  const register = useCallback(() => {
    setConsumerCount((count) => count + 1);
    return () => setConsumerCount((count) => count - 1);
  }, []);

  const open = useCallback(
    (ref?: RefObject<HTMLElement | null>) => {
      openerRef.current = document.activeElement as HTMLElement | null;
      fallbackFocusRef.current = ref ?? null;
      setIsOpen(true);
      // Catch invitations that arrived since the list was last loaded.
      void refetch();
    },
    [refetch],
  );

  /**
   * Radix restores focus to the trigger it opened from, which this dialog does
   * not have, and the element that did open it is commonly gone by now:
   * resolving the last invitation drops the count to 0, unmounting every
   * trigger. So take it over, and never leave focus on the body.
   */
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();

    const opener = openerRef.current;
    if (opener?.isConnected) {
      opener.focus();
      return;
    }

    const fallback = fallbackFocusRef.current?.current;
    if (fallback?.isConnected) {
      fallback.focus();
      return;
    }

    const main = document.querySelector("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
      main.focus();
    }
  }, []);

  const value = useMemo<PendingInvitationsContextValue>(
    () => ({
      count: pendingCount,
      isLoading,
      error,
      open,
      acceptedCount,
      register,
    }),
    [pendingCount, isLoading, error, open, acceptedCount, register],
  );

  return (
    <PendingInvitationsContext.Provider value={value}>
      {children}
      <PendingInvitationsDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        invitations={invitations}
        resolutions={resolutions}
        inFlight={inFlight}
        // A refresh behind an open dialog should not replace rows with a spinner.
        isLoading={isLoading && invitations.length === 0}
        error={error}
        onAccept={accept}
        onDecline={decline}
        onRetry={refetch}
        onCloseAutoFocus={handleCloseAutoFocus}
      />
    </PendingInvitationsContext.Provider>
  );
}

/**
 * Reads the shared count and opens the shared dialog. Registering here is what
 * enables the fetch, so a page with no trigger mounted makes no request.
 */
export function usePendingInvitations(): PendingInvitationsContextValue {
  const context = useContext(PendingInvitationsContext);
  const { register } = context;

  useEffect(() => register(), [register]);

  return context;
}
