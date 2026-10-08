import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { TeamSelect } from "@/components/common/TeamSelect";
import { VisibilityInfoContent } from "@/components/common/VisibilityInfoPopover";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CopyValue } from "@/components/ui/copy-value";
import { MCPIcon } from "@/components/icons/MCPIcon";
import { Field } from "@/components/ui/field";
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
import type { CatalogServer, CatalogServerRegisterBody } from "@/generated/types";
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
export function CatalogOAuthForm({
  server,
  onCancel,
  onSuccess,
  onSubmit,
  isSubmitting,
  notification,
  onDismissNotification,
}: {
  server: CatalogServer;
  onCancel: () => void;
  onSuccess: () => void;
  onSubmit: (body: CatalogServerRegisterBody) => Promise<boolean>;
  isSubmitting: boolean;
  notification?: { type: "success" | "error" | "info"; message: string };
  onDismissNotification?: () => void;
}) {
  const intl = useIntl();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const oauth = server.oauth; // pragma: allowlist secret
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState(oauth?.issuer ?? "");
  const [scopes, setScopes] = useState(oauth?.scopes?.join(" ") ?? "");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState(""); // pragma: allowlist secret
  const [authorizationUrl, setAuthorizationUrl] = useState(oauth?.authorization_url ?? "");
  const [tokenUrl, setTokenUrl] = useState(oauth?.token_url ?? "");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [teamId, setTeamId] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const {
    data: callbackData,
    error: callbackError,
    isLoading: isCallbackLoading,
    refetch: retryCallback,
  } = useQuery<{ redirectUri: string }>("/oauth/callback-url", { enabled: true });
  const { teams, onTeamChange } = useTeamScope({
    visibility,
    teamId,
    onTeamIdChange: setTeamId,
  });

  const callbackUrl = callbackData?.redirectUri;
  const isCallbackUrlReady =
    Boolean(callbackUrl && isHttpUrl(callbackUrl)) && !isCallbackLoading && !callbackError;
  const scopesList = useMemo(
    () =>
      scopes
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    [scopes],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;
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
              // prettier-ignore
              clientSecret: intl.formatMessage({ id: "mcpServer.catalog.oauth.clientSecretRequired" }), // pragma: allowlist secret
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
      if (Object.keys(nextErrors).length > 0 || !isCallbackUrlReady) return;

      const registered = await onSubmit({
        name: name.trim() || null,
        visibility,
        team_id: visibility === "team" ? teamId : null,
        oauth_credentials: {
          // pragma: allowlist secret
          grant_type: "authorization_code",
          issuer: issuer.trim(),
          client_id: clientId.trim(),
          client_secret: clientSecret, // pragma: allowlist secret
          authorization_url: authorizationUrl.trim(),
          token_url: tokenUrl.trim(),
          redirect_uri: callbackUrl,
          scopes: scopesList,
        },
      });
      if (registered) onSuccess();
    },
    [
      authorizationUrl,
      callbackUrl,
      clientId,
      clientSecret,
      onSuccess,
      isSubmitting,
      intl,
      isCallbackUrlReady,
      issuer,
      name,
      onSubmit,
      scopesList,
      teamId,
      tokenUrl,
      visibility,
    ],
  );

  return (
    <Card className="mx-auto mt-6 w-full max-w-3xl gap-0 overflow-visible rounded-xl border border-border p-0 ring-0">
      <CardContent className="flex flex-col gap-8 p-6 sm:p-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground shadow-sm">
              <MCPIcon className="h-4 w-4" />
            </div>
            <h2
              ref={headingRef}
              id="catalog-oauth-heading"
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              {intl.formatMessage({ id: "mcpServer.catalog.oauth.title" }, { name: server.name })}
            </h2>
          </div>
          <p id="catalog-oauth-description" className="text-sm leading-6 text-muted-foreground">
            {intl.formatMessage({ id: "mcpServer.catalog.oauth.description" })}
          </p>
        </div>
        <form
          aria-labelledby="catalog-oauth-heading"
          aria-describedby="catalog-oauth-description"
          className="space-y-6"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {notification && (
            <div className="mt-4">
              <InlineNotification
                type={notification.type}
                message={notification.message}
                onDismiss={onDismissNotification}
              />
            </div>
          )}

          <div className="space-y-6">
            <Field
              id="catalog-oauth-name"
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
              id="catalog-oauth-issuer"
              label={intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlLabel" })}
              required
              error={errors.issuer}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
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
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              id="catalog-oauth-scopes"
              label={intl.formatMessage({ id: "mcpServer.auth.oauth.scopesLabel" })}
              required
              error={errors.scopes}
              hint={intl.formatMessage({ id: "mcpServer.auth.oauth.scopesDescription" })}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={scopes}
                  onChange={(event) => {
                    setScopes(event.target.value);
                    setErrors((current) => ({ ...current, scopes: undefined }));
                  }}
                  placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.scopesPlaceholder" })}
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <div className="space-y-2.5">
              <Label>{intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLabel" })}</Label>
              {isCallbackUrlReady && callbackUrl ? (
                <>
                  <CopyValue
                    label={intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLabel" })}
                    value={callbackUrl}
                  />
                  <p className="text-xs text-muted-foreground">
                    {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriHelp" })}
                  </p>
                </>
              ) : isCallbackLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLoading" })}
                </p>
              ) : (
                <InlineNotification
                  type="error"
                  message={intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLoadError" })}
                  action={{
                    label: intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriRetry" }),
                    onClick: () => void retryCallback().catch(() => {}),
                  }}
                />
              )}
            </div>

            <Field
              id="catalog-oauth-client-id"
              label={intl.formatMessage({ id: "mcpServer.auth.oauth.clientIdLabel" })}
              required
              error={errors.clientId}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  autoComplete="off"
                  value={clientId}
                  onChange={(event) => {
                    setClientId(event.target.value);
                    setErrors((current) => ({ ...current, clientId: undefined }));
                  }}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.auth.oauth.clientIdPlaceholder",
                  })}
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              id="catalog-oauth-client-secret"
              label={intl.formatMessage({ id: "mcpServer.auth.oauth.clientSecretLabel" })}
              required
              error={errors.clientSecret}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="password"
                  autoComplete="new-password"
                  value={clientSecret}
                  onChange={(event) => {
                    setClientSecret(event.target.value);
                    setErrors((current) => ({ ...current, clientSecret: undefined })); // pragma: allowlist secret
                  }}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.auth.oauth.clientSecretPlaceholder",
                  })}
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              id="catalog-oauth-authorization-url"
              label={intl.formatMessage({ id: "mcpServer.auth.oauth.authorizationUrlLabel" })}
              required
              error={errors.authorizationUrl}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
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
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              id="catalog-oauth-token-url"
              label={intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlLabel" })}
              required
              error={errors.tokenUrl}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="url"
                  inputMode="url"
                  value={tokenUrl}
                  onChange={(event) => {
                    setTokenUrl(event.target.value);
                    setErrors((current) => ({ ...current, tokenUrl: undefined }));
                  }}
                  placeholder={intl.formatMessage({
                    id: "mcpServer.auth.oauth.tokenUrlPlaceholder",
                  })}
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              id="catalog-oauth-visibility"
              label={intl.formatMessage({ id: "gateways.createServer.visibility" })}
              info={<VisibilityInfoContent />}
            >
              {(controlProps) => (
                <Select
                  value={visibility}
                  onValueChange={(value: Visibility) => {
                    setVisibility(value);
                    setErrors((current) => ({ ...current, team: undefined }));
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger {...controlProps} className="w-full">
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
              )}
            </Field>
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

          <CardFooter className="justify-end gap-2 px-0">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              {intl.formatMessage({ id: "common.button.cancel" })}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !isCallbackUrlReady}
              aria-busy={isSubmitting || isCallbackLoading}
            >
              {isSubmitting
                ? intl.formatMessage({ id: "mcpServer.catalog.adding" })
                : intl.formatMessage({ id: "common.button.save" })}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
