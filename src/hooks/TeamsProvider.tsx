import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@/hooks/useQuery";
import { sanitizeError } from "@/utils/errors";
import type { Team, TeamsResponse } from "@/types/team";

interface TeamsContextType {
  teams: Team[];
  /** True only until the first response lands; a refetch keeps the current list on screen. */
  isLoading: boolean;
  error: string | null;
  /** Reloads the shared list. Never rejects: a failure surfaces through `error`. */
  refetch: () => Promise<void>;
}

const TeamsContext = createContext<TeamsContextType | undefined>(undefined);

/**
 * Owns the one `/teams` request for the signed-in shell. `useQuery` has no shared
 * cache, so without this the sidebar switcher and every team picker fetched (and
 * went stale) independently. Anything that changes the caller's teams should call
 * `refetch` from `useTeamsContext` so every consumer updates together.
 */
export function TeamsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useQuery<TeamsResponse>("/teams");

  const teams = useMemo(() => data?.teams ?? [], [data?.teams]);

  const refresh = useCallback(async () => {
    try {
      await refetch();
    } catch (err) {
      console.error("Failed to refresh teams:", sanitizeError(err));
    }
  }, [refetch]);

  const value = useMemo<TeamsContextType>(
    () => ({
      teams,
      isLoading: isLoading && data === undefined,
      error: error?.message ?? null,
      refetch: refresh,
    }),
    [teams, isLoading, data, error, refresh],
  );

  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>;
}

export function useTeamsContext(): TeamsContextType {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error("useTeamsContext must be used inside <TeamsProvider>");
  return ctx;
}
