import { useIntl } from "react-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Team } from "@/types/team";

interface TeamSelectProps {
  /** Teams the caller belongs to, from `useTeams()`. */
  teams: Team[];
  value?: string;
  onChange: (teamId: string) => void;
  /** Validation message for the field, rendered below the select. */
  error?: string;
  /** Element id for the select, so each form can scope it. */
  id?: string;
}

/**
 * Team picker for `team`-visibility records.
 *
 * Renders nothing when the caller has fewer than two teams: everyone belongs to
 * at least their own personal team, so a single-team caller has no choice to
 * make and the form scopes to that team silently (see `resolveTeamId`). The
 * exception is an error — shown even without a selector, so a failed `/teams`
 * load explains itself instead of leaving the submit button inert.
 */
export function TeamSelect({ teams, value, onChange, error, id = "team" }: TeamSelectProps) {
  const intl = useIntl();
  const errorId = `${id}-error`;

  if (teams.length < 2) {
    return error ? (
      <p id={errorId} className="text-sm text-destructive">
        {error}
      </p>
    ) : null;
  }

  return (
    <div className="space-y-2.5">
      <Label htmlFor={id} className="block text-sm font-medium text-foreground">
        {intl.formatMessage({ id: "common.team.label" })}{" "}
        <span className="text-destructive" aria-hidden="true">
          {intl.formatMessage({ id: "common.required" })}
        </span>
      </Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="h-10 w-full rounded-md border-neutral-300 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700"
        >
          <SelectValue placeholder={intl.formatMessage({ id: "common.team.placeholder" })} />
        </SelectTrigger>
        <SelectContent>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
