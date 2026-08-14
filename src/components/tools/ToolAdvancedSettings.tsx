import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { useTagSuggestions } from "@/hooks/useTagSuggestions";
import { MAX_TAGS } from "@/utils/tags";
import { BasicAuth } from "@/components/mcp-servers/BasicAuth";
import { ToolBearerTokenAuth } from "@/components/tools/ToolBearerTokenAuth";
import { CustomHeadersAuth, type CustomHeader } from "@/components/mcp-servers/CustomHeadersAuth";
import { useAuthContext } from "@/auth/AuthContext";
import { resolveTeamId, useTeams } from "@/hooks/useTeams";
import type { Visibility } from "@/types/server";
import { VisibilityInfoPopover } from "@/components/common/VisibilityInfoPopover";
import { TeamSelect } from "@/components/common/TeamSelect";

export type { CustomHeader };

type AuthType = "none" | "basic" | "bearer" | "custom";

interface ToolAdvancedSettingsProps {
  visibility: Visibility;
  onVisibilityChange: (value: Visibility) => void;
  teamId: string;
  onTeamIdChange: (value: string) => void;
  /** Validation message for the team field, shown on the selector. */
  teamError?: string;
  authType: AuthType;
  onAuthTypeChange: (value: AuthType) => void;
  basicAuthUsername: string;
  basicAuthPassword: string; // pragma: allowlist secret
  onBasicAuthUsernameChange: (value: string) => void;
  onBasicAuthPasswordChange: (value: string) => void;
  bearerToken: string;
  onBearerTokenChange: (value: string) => void;
  customHeaders: CustomHeader[];
  onCustomHeadersChange: (headers: CustomHeader[]) => void;
  responseFilter: string;
  onResponseFilterChange: (value: string) => void;
  tags: string[];
  onTagsChange: (value: string[]) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
}

export function ToolAdvancedSettings({
  visibility,
  onVisibilityChange,
  teamId,
  onTeamIdChange,
  teamError,
  authType,
  onAuthTypeChange,
  basicAuthUsername,
  basicAuthPassword,
  onBasicAuthUsernameChange,
  onBasicAuthPasswordChange,
  bearerToken,
  onBearerTokenChange,
  customHeaders,
  onCustomHeadersChange,
  responseFilter,
  onResponseFilterChange,
  tags,
  onTagsChange,
  description,
  onDescriptionChange,
}: ToolAdvancedSettingsProps) {
  const intl = useIntl();
  const { selectedTeamId } = useAuthContext();
  const { teams } = useTeams();
  const tagSuggestions = useTagSuggestions();

  const [pickedInForm, setPickedInForm] = useState(false);

  // The sidebar switcher stays authoritative until the caller picks a team in
  // the selector below. "All teams" is not a scope a tool can be created in, so
  // it resolves to the caller's own team rather than leaving the tool unscoped.
  useEffect(() => {
    if (visibility !== "team") {
      if (teamId) onTeamIdChange("");
      return;
    }
    if (pickedInForm) return;

    const resolved = resolveTeamId(teams, selectedTeamId);
    if (resolved && resolved !== teamId) {
      onTeamIdChange(resolved);
    }
  }, [visibility, selectedTeamId, teams, teamId, pickedInForm, onTeamIdChange]);

  const handleTeamChange = (nextTeamId: string) => {
    setPickedInForm(true);
    onTeamIdChange(nextTeamId);
  };
  const renderAuthContent = () => {
    switch (authType) {
      case "none":
        return null;
      case "basic":
        return (
          <BasicAuth
            username={basicAuthUsername}
            password={basicAuthPassword}
            onUsernameChange={onBasicAuthUsernameChange}
            onPasswordChange={onBasicAuthPasswordChange}
          />
        );
      case "bearer":
        return <ToolBearerTokenAuth token={bearerToken} onTokenChange={onBearerTokenChange} />;
      case "custom":
        return (
          <CustomHeadersAuth
            headers={customHeaders}
            onHeadersChange={onCustomHeadersChange}
            maxHeaders={1}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 py-4">
      {/* Visibility */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="visibility"
            className="text-sm font-medium text-neutral-950 dark:text-white"
          >
            {intl.formatMessage({ id: "tools.details.label.visibility" })}
          </label>
          <VisibilityInfoPopover />
        </div>
        <Select value={visibility} onValueChange={onVisibilityChange}>
          <SelectTrigger
            id="visibility"
            className="h-10 w-full border-neutral-300 dark:border-neutral-700"
          >
            <SelectValue placeholder="Select visibility" />
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
      </div>

      {visibility === "team" && (
        <TeamSelect
          id="tool-team"
          teams={teams}
          value={teamId || undefined}
          onChange={handleTeamChange}
          error={teamError}
        />
      )}

      {/* Authentication type */}
      <div className="space-y-3">
        <label
          id="auth-type-label"
          className="text-sm font-medium text-neutral-950 dark:text-white"
        >
          Authentication type
        </label>
        <div
          role="radiogroup"
          aria-labelledby="auth-type-label"
          className="flex w-full flex-nowrap gap-1 rounded-md bg-neutral-100 p-1 dark:bg-neutral-800"
        >
          {(["none", "basic", "bearer", "custom"] as AuthType[]).map((type) => {
            const label =
              type === "none"
                ? "None"
                : type === "basic"
                  ? "Basic"
                  : type === "bearer"
                    ? "Bearer token"
                    : "Custom headers";
            const isLongerLabel = type === "custom";
            return (
              <div key={type} className={isLongerLabel ? "flex-[1.3] min-w-0" : "flex-1 min-w-0"}>
                <input
                  type="radio"
                  id={`auth-${type}`}
                  name="auth-type"
                  value={type}
                  checked={authType === type}
                  onChange={(e) => onAuthTypeChange(e.target.value as AuthType)}
                  className="sr-only peer"
                />
                <label
                  htmlFor={`auth-${type}`}
                  className="flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-center text-sm font-medium text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700 peer-checked:bg-neutral-800 peer-checked:text-white peer-checked:px-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-300 dark:peer-checked:bg-neutral-950 dark:peer-checked:text-white"
                >
                  {label}
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Auth-specific content */}
      {renderAuthContent()}

      {/* Response filter (jq) */}
      <div className="space-y-2">
        <label
          htmlFor="response-filter"
          className="text-sm font-medium text-neutral-950 dark:text-white"
        >
          Response filter (jq)
        </label>
        <Input
          id="response-filter"
          value={responseFilter}
          onChange={(e) => onResponseFilterChange(e.target.value)}
          placeholder="Optional jq expression applied to the upstream response..."
          className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label htmlFor="tags" className="text-sm font-medium text-neutral-950 dark:text-white">
          Tags
        </label>
        <TagInput
          id="tags"
          value={tags}
          onChange={onTagsChange}
          suggestions={tagSuggestions}
          maxTags={MAX_TAGS}
          placeholder={intl.formatMessage({ id: "common.tagInput.placeholder" })}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label
          htmlFor="advanced-description"
          className="text-sm font-medium text-neutral-950 dark:text-white"
        >
          Description
        </label>
        <Textarea
          id="advanced-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add an optional description..."
          className="min-h-20 focus-visible:ring-1 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
}
