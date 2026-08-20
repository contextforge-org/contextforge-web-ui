import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/auth/AuthContext";
import { useQuery } from "@/hooks/useQuery";
import type { Team, TeamsResponse } from "@/types/team";
import type { Visibility } from "@/types/server";

export interface UseTeamsResult {
  teams: Team[];
  isLoading: boolean;
}

/** The teams the caller belongs to, for scoping `team`-visibility records. */
export function useTeams(): UseTeamsResult {
  const { data, isLoading } = useQuery<TeamsResponse>("/teams");
  const teams = useMemo(() => data?.teams ?? [], [data?.teams]);

  return { teams, isLoading };
}

/**
 * Resolves the team a `team`-visibility record belongs to, in priority order:
 *
 * 1. `explicitTeamId` — the record's own team (edit mode) or an in-form choice.
 * 2. The sidebar's active team, when the switcher is not on "All teams".
 * 3. The caller's personal team, else the first team they belong to.
 *
 * Step 3 is what keeps a single-team caller from ever being asked to pick: the
 * sidebar defaults to "All teams" every session, and sending them off to the
 * switcher to choose the only team they have is a dead end. It also gives
 * multi-team callers a sane default in the in-form selector rather than an
 * empty required field behind a disabled submit button.
 */
export function resolveTeamId(
  teams: Team[],
  selectedTeamId: string | null,
  explicitTeamId?: string | null,
): string | undefined {
  if (explicitTeamId) return explicitTeamId;
  if (selectedTeamId) return selectedTeamId;
  if (teams.length === 0) return undefined;

  return (teams.find((team) => team.is_personal) ?? teams[0]).id;
}

export interface UseTeamScopeOptions {
  visibility: Visibility;
  /** The form's current team, owned by the form hook. */
  teamId: string;
  onTeamIdChange: (teamId: string) => void;
  /**
   * The team the record already belongs to, in edit mode. Undefined when
   * creating, and while the record is still loading.
   */
  recordTeamId?: string;
}

export interface UseTeamScopeResult {
  teams: Team[];
  /** Wire to the in-form selector, not `onTeamIdChange` directly. */
  onTeamChange: (teamId: string) => void;
}

/**
 * Keeps a form's `teamId` in step with its visibility, for the forms that hold
 * team state as a `teamId`/`onTeamIdChange` pair (servers, tools). `usePromptForm`
 * derives its team instead, but resolves it the same way.
 *
 * Teams rank: an in-form pick beats the record's own team, which beats the
 * sidebar switcher. So the sidebar is authoritative **only while creating**
 * (#5077), and only until the caller picks. Editing pins to `recordTeamId`:
 * the sidebar starts every session on "All teams", which used to resolve to
 * the caller's personal team and overwrite the record's real team before they
 * had touched anything.
 */
export function useTeamScope({
  visibility,
  teamId,
  onTeamIdChange,
  recordTeamId,
}: UseTeamScopeOptions): UseTeamScopeResult {
  const { selectedTeamId } = useAuthContext();
  const { teams } = useTeams();
  const [pickedTeamId, setPickedTeamId] = useState<string | undefined>(undefined);

  // Holding the pick itself rather than a "has picked" flag is what keeps the
  // resolve idempotent: the pick outranks every default inside `resolveTeamId`,
  // so it survives a round-trip through another visibility without the effect
  // needing to know a pick ever happened.
  const chosenTeamId = pickedTeamId ?? recordTeamId;

  useEffect(() => {
    if (visibility !== "team") {
      // "All teams" is not a scope a record can live in, so a non-team
      // visibility drops the team rather than leaving a stale one attached.
      if (teamId) onTeamIdChange("");
      return;
    }

    const resolved = resolveTeamId(teams, selectedTeamId, chosenTeamId);
    if (resolved && resolved !== teamId) {
      onTeamIdChange(resolved);
    }
  }, [visibility, selectedTeamId, teams, teamId, chosenTeamId, onTeamIdChange]);

  const onTeamChange = useCallback(
    (nextTeamId: string) => {
      setPickedTeamId(nextTeamId);
      onTeamIdChange(nextTeamId);
    },
    [onTeamIdChange],
  );

  return { teams, onTeamChange };
}
