import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { TeamSelect } from "@/components/common/TeamSelect";
import { VisibilityInfoPopover } from "@/components/common/VisibilityInfoPopover";
import { CopyValue } from "@/components/ui/copy-value";
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
import { Button } from "@/components/ui/button";
import type { CatalogOAuthRegisterBody } from "@/api/catalog";
import type { CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { useTeamScope } from "@/hooks/useTeams";
import type { Visibility } from "@/types/server";

type OAuthField =
  "issuer" | "scopes" | "clientId" | "clientSecret" | "authorizationUrl" | "tokenUrl" | "team";
type FieldErrors = Partial<Record<OAuthField, string>>;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * OAuth catalog registration deliberately has its own small field set.
 *
 * It shares catalog registration controls with the API-key dialog, but must
 * not reuse the general server form's grant-type selector, password grant, or
 * token-management controls. Catalog OAuth is always authorization-code.
 */
export function CatalogOAuthDialog({
  server,
  onOpenChange,
  onSubmit,
  isSubmitting,
  notification,
  onDismissNotification,
}: {
  server: CatalogServer;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: CatalogOAuthRegisterBody) => Promise<boolean>;
  isSubmitting: boolean;
  notification?: { type: "success" | "error" | "info"; message: string };
  onDismissNotification?: () => void;
}) {
  const intl = useIntl();
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [scopes, setScopes] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState(""); // pragma: allowlist secret
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [teamId, setTeamId] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const { data: callbackData } = useQuery<{ redirectUri: string }>("/oauth/callback-url", {
    enabled: true,
  });
  const { teams, onTeamChange } = useTeamScope({
    visibility,
    teamId,
    onTeamIdChange: setTeamId,
  });

  const callbackUrl = callbackData?.redirectUri;
  const scopesList = useMemo(
    () =>
      scopes
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    [scopes],
  );

  const reset = useCallback(() => {
    setName("");
    setIssuer("");
    setScopes("");
    setClientId("");
    setClientSecret("");
    setAuthorizationUrl("");
    setTokenUrl("");
    setVisibility("private");
    setTeamId("");
    setErrors({});
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
      const nextErrors: FieldErrors = {
        ...(isHttpUrl(issuer.trim())
          ? {}
          : { issuer: intl.formatMessage({ id: "mcpServer.catalog.oauth.issuerRequired" }) }),
        ...(scopesList.length > 0
          ? {}
          : { scopes: intl.formatMessage({ id: "mcpServer.catalog.oauth.scopesRequired" }) }),
        ...(clientId.trim()
          ? {}
          : { clientId: intl.formatMessage({ id: "mcpServer.catalog.oauth.clientIdRequired" }) }),
        ...(clientSecret.trim()
          ? {}
          : {
              clientSecret: intl.formatMessage({
                id: "mcpServer.catalog.oauth.clientSecretRequired",
              }),
            }),
        ...(isHttpUrl(authorizationUrl.trim())
          ? {}
          : {
              authorizationUrl: intl.formatMessage({
                id: "mcpServer.catalog.oauth.authorizationUrlRequired",
              }),
            }),
        ...(isHttpUrl(tokenUrl.trim())
          ? {}
          : { tokenUrl: intl.formatMessage({ id: "mcpServer.catalog.oauth.tokenUrlRequired" }) }),
        ...(visibility !== "team" || teamId
          ? {}
          : { team: intl.formatMessage({ id: "mcpServer.catalog.apiKey.teamRequired" }) }),
      };
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;

      const registered = await onSubmit({
        name: name.trim() || null,
        visibility,
        team_id: visibility === "team" ? teamId : null,
        oauth_credentials: {
          grant_type: "authorization_code",
          issuer: issuer.trim(),
          client_id: clientId.trim(),
          client_secret: clientSecret,
          authorization_url: authorizationUrl.trim(),
          token_url: tokenUrl.trim(),
          scopes: scopesList,
        },
      });
      if (registered) handleOpenChange(false);
    },
    [
      authorizationUrl,
      clientId,
      clientSecret,
      handleOpenChange,
      intl,
      issuer,
      name,
      onSubmit,
      scopesList,
      teamId,
      tokenUrl,
      visibility,
    ],
  );

  const required = (
    <span className="text-destructive" aria-hidden="true">
      {" "}
      {intl.formatMessage({ id: "common.required" })}
    </span>
  );
  const fieldError = (field: OAuthField) =>
    errors[field] ? <p className="text-sm text-destructive">{errors[field]}</p> : null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage({ id: "mcpServer.catalog.oauth.title" }, { name: server.name })}
            </DialogTitle>
            <DialogDescription>
              {intl.formatMessage({ id: "mcpServer.catalog.oauth.description" })}
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
            <div className="space-y-2.5">
              <Label htmlFor="catalog-oauth-name">
                {intl.formatMessage({ id: "mcpServer.catalog.apiKey.nameLabel" })}
              </Label>
              <Input
                id="catalog-oauth-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={intl.formatMessage({ id: "mcpServer.catalog.apiKey.namePlaceholder" })}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="catalog-oauth-issuer">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlLabel" })}
                {required}
              </Label>
              <Input
                id="catalog-oauth-issuer"
                type="url"
                inputMode="url"
                value={issuer}
                onChange={(event) => {
                  setIssuer(event.target.value);
                  setErrors((current) => ({ ...current, issuer: undefined }));
                }}
                placeholder={intl.formatMessage({
                  id: "mcpServer.auth.oauth.issuerUrlPlaceholder",
                })}
                aria-invalid={Boolean(errors.issuer)}
                disabled={isSubmitting}
              />
              {fieldError("issuer")}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="catalog-oauth-scopes">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.scopesLabel" })}
                {required}
              </Label>
              <Input
                id="catalog-oauth-scopes"
                value={scopes}
                onChange={(event) => {
                  setScopes(event.target.value);
                  setErrors((current) => ({ ...current, scopes: undefined }));
                }}
                placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.scopesPlaceholder" })}
                aria-invalid={Boolean(errors.scopes)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.scopesDescription" })}
              </p>
              {fieldError("scopes")}
            </div>

            {callbackUrl && (
              <div className="space-y-2.5">
                <Label>{intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLabel" })}</Label>
                <CopyValue
                  label={intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLabel" })}
                  value={callbackUrl}
                />
                <p className="text-xs text-muted-foreground">
                  {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriHelp" })}
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              <Label htmlFor="catalog-oauth-client-id">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.clientIdLabel" })}
                {required}
              </Label>
              <Input
                id="catalog-oauth-client-id"
                autoComplete="off"
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setErrors((current) => ({ ...current, clientId: undefined }));
                }}
                placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.clientIdPlaceholder" })}
                aria-invalid={Boolean(errors.clientId)}
                disabled={isSubmitting}
              />
              {fieldError("clientId")}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="catalog-oauth-client-secret">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.clientSecretLabel" })}
                {required}
              </Label>
              <Input
                id="catalog-oauth-client-secret"
                type="password"
                autoComplete="new-password"
                value={clientSecret}
                onChange={(event) => {
                  setClientSecret(event.target.value);
                  setErrors((current) => ({ ...current, clientSecret: undefined }));
                }}
                placeholder={intl.formatMessage({
                  id: "mcpServer.auth.oauth.clientSecretPlaceholder",
                })}
                aria-invalid={Boolean(errors.clientSecret)}
                disabled={isSubmitting}
              />
              {fieldError("clientSecret")}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="catalog-oauth-authorization-url">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.authorizationUrlLabel" })}
                {required}
              </Label>
              <Input
                id="catalog-oauth-authorization-url"
                type="url"
                inputMode="url"
                value={authorizationUrl}
                onChange={(event) => {
                  setAuthorizationUrl(event.target.value);
                  setErrors((current) => ({ ...current, authorizationUrl: undefined }));
                }}
                placeholder={intl.formatMessage({
                  id: "mcpServer.auth.oauth.authorizationUrlPlaceholder",
                })}
                aria-invalid={Boolean(errors.authorizationUrl)}
                disabled={isSubmitting}
              />
              {fieldError("authorizationUrl")}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="catalog-oauth-token-url">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlLabel" })}
                {required}
              </Label>
              <Input
                id="catalog-oauth-token-url"
                type="url"
                inputMode="url"
                value={tokenUrl}
                onChange={(event) => {
                  setTokenUrl(event.target.value);
                  setErrors((current) => ({ ...current, tokenUrl: undefined }));
                }}
                placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlPlaceholder" })}
                aria-invalid={Boolean(errors.tokenUrl)}
                disabled={isSubmitting}
              />
              {fieldError("tokenUrl")}
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
                  setErrors((current) => ({ ...current, team: undefined }));
                }}
                disabled={isSubmitting}
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
                error={errors.team}
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
                : intl.formatMessage({ id: "mcpServer.catalog.oauth.submit" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
