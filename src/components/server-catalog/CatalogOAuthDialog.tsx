import { useCallback, useState } from "react";
import { useIntl } from "react-intl";

import { runOAuthAuthorization, type OAuthAuthorizationOutcome } from "@/api/catalog";
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
import { InlineNotification } from "@/components/ui/inline-notification";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogServer, CatalogServerRegisterBody } from "@/generated/types";
import { useTeamScope } from "@/hooks/useTeams";
import type { Visibility } from "@/types/server";

type DialogStep = "config" | "authorizing";

interface RegisterResult {
  success: boolean;
  serverId?: string;
}

/**
 * OAuth add flow for a catalog entry (#5967). One field set for every non-seeded
 * provider case: Issuer URL and Scopes are the only fields a caller must know up
 * front. Client ID/Secret and Token/Authorization URL are left optional - the
 * backend already fills them in automatically for providers that support
 * discovery and/or dynamic client registration, and only actually needs them
 * when a provider offers neither.
 */
export function CatalogOAuthDialog({
  server,
  onOpenChange,
  onRegister,
  isRegistering,
  notification,
  onDismissNotification,
  onAuthorizationSettled,
}: {
  server: CatalogServer;
  onOpenChange: (open: boolean) => void;
  onRegister: (body: CatalogServerRegisterBody) => Promise<RegisterResult>;
  isRegistering: boolean;
  notification?: { type: "success" | "error" | "info"; message: string };
  onDismissNotification?: () => void;
  onAuthorizationSettled: (server: CatalogServer, outcome: OAuthAuthorizationOutcome) => void;
}) {
  const intl = useIntl();
  const [step, setStep] = useState<DialogStep>("config");
  const [name, setName] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [scopes, setScopes] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState(""); // pragma: allowlist secret
  const [tokenUrl, setTokenUrl] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [teamId, setTeamId] = useState("");
  const [issuerError, setIssuerError] = useState<string>();
  const [scopesError, setScopesError] = useState<string>();
  const [teamError, setTeamError] = useState<string>();
  const { teams, onTeamChange } = useTeamScope({
    visibility,
    teamId,
    onTeamIdChange: setTeamId,
  });

  const isBusy = isRegistering || step === "authorizing";

  const reset = useCallback(() => {
    setStep("config");
    setName("");
    setIssuerUrl("");
    setScopes("");
    setClientId("");
    setClientSecret("");
    setTokenUrl("");
    setAuthorizationUrl("");
    setVisibility("private");
    setTeamId("");
    setIssuerError(undefined);
    setScopesError(undefined);
    setTeamError(undefined);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isBusy) return;
      if (!open) reset();
      onOpenChange(open);
    },
    [isBusy, onOpenChange, reset],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const nextIssuerError = issuerUrl.trim()
        ? undefined
        : intl.formatMessage({ id: "mcpServer.catalog.oauth.issuerRequired" });
      const nextScopesError = scopes.trim()
        ? undefined
        : intl.formatMessage({ id: "mcpServer.catalog.oauth.scopesRequired" });
      const nextTeamError =
        visibility === "team" && !teamId
          ? intl.formatMessage({ id: "mcpServer.catalog.apiKey.teamRequired" })
          : undefined;
      setIssuerError(nextIssuerError);
      setScopesError(nextScopesError);
      setTeamError(nextTeamError);
      if (nextIssuerError || nextScopesError || nextTeamError) return;

      const { success, serverId } = await onRegister({
        name: name.trim() || null,
        visibility,
        team_id: visibility === "team" ? teamId : null,
        oauth_credentials: {
          issuer: issuerUrl.trim(),
          scopes: scopes.trim().split(/\s+/).filter(Boolean),
          client_id: clientId.trim() || undefined,
          client_secret: clientSecret.trim() || undefined,
          token_url: tokenUrl.trim() || undefined,
          authorization_url: authorizationUrl.trim() || undefined,
        },
      });
      if (!success || !serverId) return;

      // The gateway is already registered at this point (visible on the catalog
      // grid as "needs authorization"), so the dialog stays open through the
      // popup rather than closing early - closing now would just make the user
      // hunt for the card's Authorize action to finish what they just started.
      setStep("authorizing");
      const outcome = await runOAuthAuthorization(serverId);
      onAuthorizationSettled(server, outcome);
      handleOpenChange(false);
    },
    [
      authorizationUrl,
      clientId,
      clientSecret,
      handleOpenChange,
      intl,
      issuerUrl,
      name,
      onAuthorizationSettled,
      onRegister,
      scopes,
      server,
      teamId,
      tokenUrl,
      visibility,
    ],
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage({ id: "mcpServer.catalog.oauth.title" }, { name: server.name })}
            </DialogTitle>
            <DialogDescription>
              {intl.formatMessage({
                id:
                  step === "authorizing"
                    ? "mcpServer.catalog.oauth.authorizingDescription"
                    : "mcpServer.catalog.oauth.description",
              })}
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

          {step === "config" && (
            <div className="space-y-5 py-5">
              <div className="space-y-2.5">
                <Label htmlFor="catalog-oauth-name">
                  {intl.formatMessage({ id: "mcpServer.catalog.apiKey.nameLabel" })}
                </Label>
                <Input
                  id="catalog-oauth-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.apiKey.namePlaceholder",
                  })}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="catalog-oauth-issuer">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.issuerLabel" })}
                  <span className="text-destructive" aria-hidden="true">
                    {" "}
                    {intl.formatMessage({ id: "common.required" })}
                  </span>
                </Label>
                <Input
                  id="catalog-oauth-issuer"
                  value={issuerUrl}
                  onChange={(event) => {
                    setIssuerUrl(event.target.value);
                    setIssuerError(undefined);
                  }}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.oauth.issuerPlaceholder",
                  })}
                  aria-required="true"
                  aria-invalid={!!issuerError}
                  aria-describedby={issuerError ? "catalog-oauth-issuer-error" : undefined}
                  disabled={isBusy}
                />
                {issuerError && (
                  <p id="catalog-oauth-issuer-error" className="text-sm text-destructive">
                    {issuerError}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="catalog-oauth-scopes">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.scopesLabel" })}
                  <span className="text-destructive" aria-hidden="true">
                    {" "}
                    {intl.formatMessage({ id: "common.required" })}
                  </span>
                </Label>
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.scopesHelp" })}
                </p>
                <Textarea
                  id="catalog-oauth-scopes"
                  value={scopes}
                  onChange={(event) => {
                    setScopes(event.target.value);
                    setScopesError(undefined);
                  }}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.oauth.scopesPlaceholder",
                  })}
                  aria-required="true"
                  aria-invalid={!!scopesError}
                  aria-describedby={scopesError ? "catalog-oauth-scopes-error" : undefined}
                  disabled={isBusy}
                  className="min-h-16"
                />
                {scopesError && (
                  <p id="catalog-oauth-scopes-error" className="text-sm text-destructive">
                    {scopesError}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="catalog-oauth-client-id">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.clientIdLabel" })}
                </Label>
                <Input
                  id="catalog-oauth-client-id"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.oauth.clientIdPlaceholder",
                  })}
                  disabled={isBusy}
                />
                <p className="text-xs text-muted-foreground">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.discoveryHelp" })}
                </p>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="catalog-oauth-client-secret">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.clientSecretLabel" })}
                </Label>
                <Input
                  id="catalog-oauth-client-secret"
                  type="password"
                  autoComplete="off"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.oauth.clientSecretPlaceholder",
                  })}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="catalog-oauth-token-url">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.tokenUrlLabel" })}
                </Label>
                <Input
                  id="catalog-oauth-token-url"
                  value={tokenUrl}
                  onChange={(event) => setTokenUrl(event.target.value)}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.oauth.tokenUrlPlaceholder",
                  })}
                  disabled={isBusy}
                />
                <p className="text-xs text-muted-foreground">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.discoveryHelp" })}
                </p>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="catalog-oauth-authorization-url">
                  {intl.formatMessage({ id: "mcpServer.catalog.oauth.authorizationUrlLabel" })}
                </Label>
                <Input
                  id="catalog-oauth-authorization-url"
                  value={authorizationUrl}
                  onChange={(event) => setAuthorizationUrl(event.target.value)}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.catalog.oauth.authorizationUrlPlaceholder",
                  })}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="catalog-oauth-visibility">
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
                  disabled={isBusy}
                >
                  <SelectTrigger id="catalog-oauth-visibility" className="w-full">
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
                  id="catalog-oauth-team"
                  teams={teams}
                  value={teamId || undefined}
                  onChange={onTeamChange}
                  error={teamError}
                />
              )}
            </div>
          )}

          {step === "authorizing" && (
            <div className="py-5">
              <p role="status" className="text-sm text-muted-foreground">
                {intl.formatMessage({ id: "mcpServer.catalog.oauth.authorizingMessage" })}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isBusy}
            >
              {intl.formatMessage({ id: "common.button.cancel" })}
            </Button>
            {step === "config" && (
              <Button type="submit" disabled={isBusy} aria-busy={isBusy}>
                {isRegistering
                  ? intl.formatMessage({ id: "mcpServer.catalog.adding" })
                  : intl.formatMessage({ id: "mcpServer.catalog.oauth.submit" })}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
