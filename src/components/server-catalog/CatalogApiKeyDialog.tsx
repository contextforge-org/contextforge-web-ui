import { useCallback, useState } from "react";
import { useIntl } from "react-intl";

import { TeamSelect } from "@/components/common/TeamSelect";
import { VisibilityInfoPopover } from "@/components/common/VisibilityInfoPopover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogServer, CatalogServerRegisterBody } from "@/generated/types";
import { useTeamScope } from "@/hooks/useTeams";
import type { Visibility } from "@/types/server";

export function CatalogApiKeyDialog({
  server,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  server: CatalogServer;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: CatalogServerRegisterBody) => Promise<boolean>;
  isSubmitting: boolean;
}) {
  const intl = useIntl();
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState(""); // pragma: allowlist secret
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [teamId, setTeamId] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string>();
  const [teamError, setTeamError] = useState<string>();
  const { teams, onTeamChange } = useTeamScope({
    visibility,
    teamId,
    onTeamIdChange: setTeamId,
  });

  const reset = useCallback(() => {
    setName("");
    setApiKey("");
    setVisibility("private");
    setTeamId("");
    setApiKeyError(undefined);
    setTeamError(undefined);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isSubmitting) return;
      if (!open) reset();
      onOpenChange(open);
    },
    [isSubmitting, onOpenChange, reset],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextApiKeyError = apiKey.trim()
        ? undefined
        : intl.formatMessage({ id: "mcpServer.catalog.apiKey.required" });
      const nextTeamError =
        visibility === "team" && !teamId
          ? intl.formatMessage({ id: "mcpServer.catalog.apiKey.teamRequired" })
          : undefined;
      setApiKeyError(nextApiKeyError);
      setTeamError(nextTeamError);
      if (nextApiKeyError || nextTeamError) return;

      const registered = await onSubmit({
        name: name.trim() || null,
        api_key: apiKey,
        visibility,
        team_id: visibility === "team" ? teamId : null,
      });
      if (registered) handleOpenChange(false);
    },
    [apiKey, handleOpenChange, intl, name, onSubmit, teamId, visibility],
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage({ id: "mcpServer.catalog.apiKey.title" }, { name: server.name })}
            </DialogTitle>
            <DialogDescription>
              {intl.formatMessage({ id: "mcpServer.catalog.apiKey.description" })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-5">
            <div className="space-y-2.5">
              <Label htmlFor="catalog-server-name">
                {intl.formatMessage({ id: "mcpServer.catalog.apiKey.nameLabel" })}
              </Label>
              <Input
                id="catalog-server-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={intl.formatMessage({ id: "mcpServer.catalog.apiKey.namePlaceholder" })}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="catalog-server-api-key">
                {intl.formatMessage({ id: "mcpServer.catalog.apiKey.keyLabel" })}
                <span className="text-destructive" aria-hidden="true">
                  {" "}
                  {intl.formatMessage({ id: "common.required" })}
                </span>
              </Label>
              <Input
                id="catalog-server-api-key"
                type="password"
                autoComplete="off"
                maxLength={4096}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setApiKeyError(undefined);
                }}
                placeholder={intl.formatMessage({ id: "mcpServer.catalog.apiKey.keyPlaceholder" })}
                aria-required="true"
                aria-invalid={!!apiKeyError}
                aria-describedby={apiKeyError ? "catalog-server-api-key-error" : undefined}
                disabled={isSubmitting}
              />
              {apiKeyError && (
                <p id="catalog-server-api-key-error" className="text-sm text-destructive">
                  {apiKeyError}
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="catalog-server-visibility">
                  {intl.formatMessage({ id: "gateways.createServer.visibility" })}
                </Label>
                <VisibilityInfoPopover />
              </div>
              <Select
                value={visibility}
                onValueChange={(value: Visibility) => {
                  setVisibility(value);
                  setTeamError(undefined);
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger id="catalog-server-visibility">
                  <SelectValue
                    placeholder={intl.formatMessage({
                      id: "mcpServer.advanced.visibilityPlaceholder",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    {intl.formatMessage({ id: "common.visibility.private" })}
                  </SelectItem>
                  <SelectItem value="team">
                    {intl.formatMessage({ id: "common.visibility.team" })}
                  </SelectItem>
                  <SelectItem value="public">
                    {intl.formatMessage({ id: "common.visibility.internal" })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {visibility === "team" && (
              <TeamSelect
                id="catalog-server-team"
                teams={teams}
                value={teamId || undefined}
                onChange={onTeamChange}
                error={teamError}
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {intl.formatMessage({ id: "common.button.cancel" })}
            </Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting
                ? intl.formatMessage({ id: "mcpServer.catalog.adding" })
                : intl.formatMessage({ id: "mcpServer.catalog.apiKey.submit" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
