import { useCallback, useState } from "react";
import { useIntl } from "react-intl";

import { TeamSelect } from "@/components/common/TeamSelect";
import { VisibilityInfoContent } from "@/components/common/VisibilityInfoPopover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Input } from "@/components/ui/input";
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
  notification,
  onDismissNotification,
}: {
  server: CatalogServer;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: CatalogServerRegisterBody) => Promise<boolean>;
  isSubmitting: boolean;
  notification?: { type: "success" | "error" | "info"; message: string };
  onDismissNotification?: () => void;
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
        api_key: apiKey, // pragma: allowlist secret
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

          {notification && (
            <div className="mt-4">
              <InlineNotification
                type={notification.type}
                message={notification.message}
                onDismiss={onDismissNotification}
              />
            </div>
          )}

          <div className="space-y-5 py-5">
            <Field
              id="catalog-server-name"
              label={intl.formatMessage({ id: "mcpServer.catalog.apiKey.nameLabel" })}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.apiKey.namePlaceholder",
                  })}
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              id="catalog-server-api-key"
              required
              error={apiKeyError}
              label={intl.formatMessage({ id: "mcpServer.catalog.apiKey.keyLabel" })}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="password"
                  autoComplete="off"
                  maxLength={4096}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setApiKeyError(undefined);
                  }}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.apiKey.keyPlaceholder",
                  })}
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              id="catalog-server-visibility"
              info={<VisibilityInfoContent />}
              label={intl.formatMessage({ id: "gateways.createServer.visibility" })}
            >
              {(controlProps) => (
                <Select
                  value={visibility}
                  onValueChange={(value: Visibility) => {
                    setVisibility(value);
                    setTeamError(undefined);
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger {...controlProps}>
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
                    {/* "public" means org-internal visibility; the UI label is "Internal". */}
                    <SelectItem value="public">
                      {intl.formatMessage({ id: "common.visibility.internal" })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

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
