import { useIntl } from "react-intl";
import { TeamSelect } from "@/components/common/TeamSelect";
import { VisibilityInfoContent } from "@/components/common/VisibilityInfoPopover";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Team } from "@/types/team";
import type { Visibility } from "@/types/server";

interface VisibilityFieldsProps {
  visibility: Visibility;
  onVisibilityChange: (value: Visibility) => void;
  teams: Team[];
  teamId?: string;
  onTeamChange: (teamId: string) => void;
  teamError?: string;
  /** Distinguishes the ids when more than one of these is on a page. */
  idPrefix?: string;
}

/** Visibility select, plus the team picker once "Team" is chosen. */
export function VisibilityFields({
  visibility,
  onVisibilityChange,
  teams,
  teamId,
  onTeamChange,
  teamError,
  idPrefix = "agent",
}: VisibilityFieldsProps) {
  const intl = useIntl();

  return (
    <>
      <Field
        id={`${idPrefix}-visibility`}
        required
        info={<VisibilityInfoContent />}
        label={intl.formatMessage({ id: "agents.connect.auth.visibility" })}
        labelProps={{ className: "inline-flex items-center gap-0.5" }}
      >
        {(controlProps) => (
          <Select
            value={visibility}
            onValueChange={(value) => onVisibilityChange(value as Visibility)}
          >
            <SelectTrigger
              {...controlProps}
              className="rounded-md border-neutral-300 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">
                {intl.formatMessage({ id: "common.visibility.internal" })}
              </SelectItem>
              <SelectItem value="private">
                {intl.formatMessage({ id: "common.visibility.private" })}
              </SelectItem>
              <SelectItem value="team">
                {intl.formatMessage({ id: "common.visibility.team" })}
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {visibility === "team" && (
        <TeamSelect
          id={`${idPrefix}-team`}
          teams={teams}
          value={teamId}
          onChange={onTeamChange}
          error={teamError}
        />
      )}
    </>
  );
}
