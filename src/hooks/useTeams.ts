import { useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import type { Team, TeamsResponse } from "@/types/team";

export interface UseTeamsResult {
  teams: Team[];
  isLoading: boolean;
  /**
   * Whether the caller has to choose a team explicitly. Every user belongs to
   * at least their own personal team, so a single-team caller is never asked:
   * forms scope to that team implicitly and render no selector.
   */
  requiresSelection: boolean;
}

/** The teams the caller belongs to, for scoping `team`-visibility records. */
export function useTeams(): UseTeamsResult {
  const { data, isLoading } = useQuery<TeamsResponse>("/teams");
  const teams = useMemo(() => data?.teams ?? [], [data?.teams]);

  return { teams, isLoading, requiresSelection: teams.length > 1 };
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
