import { useIntl } from "react-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OAuth2AuthProps {
  grantType: string;
  issuerUrl: string;
  redirectUri: string;
  isRedirectUriLoading?: boolean;
  redirectUriError?: string;
  onRetryRedirectUri?: () => void;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  authorizationUrl: string;
  scopes: string;
  storeTokens: boolean;
  autoRefresh: boolean;
  username: string;
  password: string; // pragma: allowlist secret
  onGrantTypeChange: (value: string) => void;
  onIssuerUrlChange: (value: string) => void;
  onClientIdChange: (value: string) => void;
  onClientSecretChange: (value: string) => void;
  onTokenUrlChange: (value: string) => void;
  onAuthorizationUrlChange: (value: string) => void;
  onScopesChange: (value: string) => void;
  onStoreTokensChange: (checked: boolean) => void;
  onAutoRefreshChange: (checked: boolean) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  errors?: { username?: string; password?: string };
}

export function OAuth2Auth({
  grantType,
  issuerUrl,
  redirectUri,
  isRedirectUriLoading,
  redirectUriError,
  onRetryRedirectUri,
  clientId,
  clientSecret,
  tokenUrl,
  authorizationUrl,
  scopes,
  storeTokens,
  autoRefresh,
  username,
  password,
  onGrantTypeChange,
  onIssuerUrlChange,
  onClientIdChange,
  onClientSecretChange,
  onTokenUrlChange,
  onAuthorizationUrlChange,
  onScopesChange,
  onStoreTokensChange,
  onAutoRefreshChange,
  onUsernameChange,
  onPasswordChange,
  errors,
}: OAuth2AuthProps) {
  const intl = useIntl();
  // Deliberately NOT derived from window.location.origin here: useMCPServerForm.ts
  // fetches this deployment's own /oauth/callback proxy URL from the BFF
  // (GET /oauth/callback-url, server-side-derived the same trustworthy way
  // origin-guard.ts validates Origin) and defaults redirectUri to it as soon
  // as the grant type is authorization_code, rather than leaving the field
  // unset for mcpgateway's own APP_DOMAIN-based default to apply -- that
  // default only works when mcpgateway is independently browser-reachable,
  // not the common split deployment where only this web UI is (see
  // mcp-context-forge#6458). This still briefly renders the placeholder
  // branch below while that fetch is in flight.
  const hasStoredRedirectUri = Boolean(redirectUri);
  const isLocalRedirect =
    hasStoredRedirectUri &&
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(redirectUri);
  const [copied, setCopied] = useState(false);

  const handleCopyRedirect = () => {
    void navigator.clipboard?.writeText(redirectUri);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-4">
      <Field
        id="oauth-grant-type"
        labelProps={{
          className: "inline-flex items-center gap-0.5 text-neutral-900 dark:text-neutral-100",
        }}
        label={
          <>
            {intl.formatMessage({ id: "mcpServer.auth.oauth.grantTypeLabel" })}
            <span className="text-destructive">*</span>
            <span className="sr-only">{intl.formatMessage({ id: "mcpServer.form.required" })}</span>
          </>
        }
      >
        {(controlProps) => (
          <Select value={grantType} onValueChange={onGrantTypeChange}>
            <SelectTrigger {...controlProps} className="border-neutral-300 dark:border-neutral-700">
              <SelectValue
                placeholder={intl.formatMessage({
                  id: "mcpServer.auth.oauth.grantTypePlaceholder",
                })}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="authorization_code">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.grantType.authorizationCode" })}
              </SelectItem>
              <SelectItem value="client_credentials">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.grantType.clientCredentials" })}
              </SelectItem>
              {grantType === "password" && (
                <SelectItem value="password">
                  {intl.formatMessage({ id: "mcpServer.auth.oauth.grantType.password" })}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        )}
      </Field>

      {grantType === "password" && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.passwordDeprecated" })}
        </p>
      )}

      <Field
        id="oauth-issuer-url"
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlLabel" })}
        hint={intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlHelp" })}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="text"
            value={issuerUrl}
            onChange={(e) => onIssuerUrlChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlPlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>

      {/* Redirect URI has too many mutually exclusive states (loading, error
          with retry, auto-derived help, local-redirect warning) to fit
          Field's single hint/error slot, so it stays hand-rolled; only the
          bare <label> is swapped for the shared primitive. */}
      {grantType === "authorization_code" && (
        <div className="space-y-1">
          <Label htmlFor="oauth-redirect-uri" className="text-neutral-900 dark:text-neutral-100">
            {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLabel" })}
          </Label>
          {hasStoredRedirectUri ? (
            <>
              <div className="flex items-center gap-2">
                <Input
                  id="oauth-redirect-uri"
                  type="text"
                  readOnly
                  value={redirectUri}
                  className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700 dark:text-neutral-100"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriCopy" })}
                  onClick={handleCopyRedirect}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-500">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriHelp" })}
              </p>
            </>
          ) : (
            <Input
              id="oauth-redirect-uri"
              type="text"
              readOnly
              value={intl.formatMessage({
                id: redirectUriError
                  ? "mcpServer.auth.oauth.redirectUriLoadError"
                  : isRedirectUriLoading
                    ? "mcpServer.auth.oauth.redirectUriLoading"
                    : "mcpServer.auth.oauth.redirectUriAutoPlaceholder",
              })}
              className="rounded-md border-neutral-300 px-4 text-sm text-neutral-500 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700 dark:text-neutral-500"
            />
          )}
          {!hasStoredRedirectUri && redirectUriError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">
                {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLoadError" })}
              </p>
              {onRetryRedirectUri && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={onRetryRedirectUri}
                >
                  {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriRetry" })}
                </Button>
              )}
            </div>
          )}
          {!hasStoredRedirectUri && !redirectUriError && (
            <p className="text-xs text-neutral-600 dark:text-neutral-500">
              {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriAutoHelp" })}
            </p>
          )}
          {isLocalRedirect && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLocalWarning" })}
            </p>
          )}
        </div>
      )}

      {grantType === "password" && (
        <>
          <Field
            id="oauth-username"
            error={errors?.username}
            labelProps={{
              className: "inline-flex items-center gap-0.5 text-neutral-900 dark:text-neutral-100",
            }}
            label={
              <>
                {intl.formatMessage({ id: "mcpServer.auth.oauth.usernameLabel" })}
                <span className="text-destructive">*</span>
                <span className="sr-only">
                  {intl.formatMessage({ id: "mcpServer.form.required" })}
                </span>
              </>
            }
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="text"
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.usernamePlaceholder" })}
                className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
            )}
          </Field>
          <Field
            id="oauth-password"
            error={errors?.password}
            labelProps={{
              className: "inline-flex items-center gap-0.5 text-neutral-900 dark:text-neutral-100",
            }}
            label={
              <>
                {intl.formatMessage({ id: "mcpServer.auth.oauth.passwordLabel" })}
                <span className="text-destructive">*</span>
                <span className="sr-only">
                  {intl.formatMessage({ id: "mcpServer.form.required" })}
                </span>
              </>
            }
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
            )}
          </Field>
        </>
      )}

      <Field
        id="oauth-client-id"
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.oauth.clientIdLabel" })}
        hint={
          grantType === "authorization_code"
            ? intl.formatMessage({ id: "mcpServer.auth.oauth.dcrHelp" })
            : undefined
        }
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="text"
            value={clientId}
            onChange={(e) => onClientIdChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.clientIdPlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>

      <Field
        id="oauth-client-secret"
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.oauth.clientSecretLabel" })}
        hint={
          grantType === "authorization_code"
            ? intl.formatMessage({ id: "mcpServer.auth.oauth.dcrHelp" })
            : undefined
        }
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="password"
            value={clientSecret}
            onChange={(e) => onClientSecretChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.clientSecretPlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>

      <Field
        id="oauth-token-url"
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlLabel" })}
        hint={intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlHelp" })}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="text"
            value={tokenUrl}
            onChange={(e) => onTokenUrlChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlPlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>

      {grantType === "authorization_code" && (
        <Field
          id="oauth-authorization-url"
          labelProps={{
            className: "inline-flex items-center gap-0.5 text-neutral-900 dark:text-neutral-100",
          }}
          label={
            <>
              {intl.formatMessage({ id: "mcpServer.auth.oauth.authorizationUrlLabel" })}
              <span className="text-destructive">*</span>
              <span className="sr-only">
                {intl.formatMessage({ id: "mcpServer.form.required" })}
              </span>
            </>
          }
          hint={intl.formatMessage({ id: "mcpServer.auth.oauth.authorizationUrlHelp" })}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              type="text"
              value={authorizationUrl}
              onChange={(e) => onAuthorizationUrlChange(e.target.value)}
              placeholder={intl.formatMessage({
                id: "mcpServer.auth.oauth.authorizationUrlPlaceholder",
              })}
              className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
          )}
        </Field>
      )}

      <Field
        id="oauth-scopes"
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.oauth.scopesLabel" })}
      >
        {(controlProps) => (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {intl.formatMessage({ id: "mcpServer.auth.oauth.scopesDescription" })}
            </p>
            <Textarea
              {...controlProps}
              value={scopes}
              onChange={(e) => onScopesChange(e.target.value)}
              placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.scopesPlaceholder" })}
              className="min-h-20 focus-visible:ring-1 focus-visible:ring-offset-0"
            />
          </>
        )}
      </Field>

      <div className="space-y-2">
        <Label className="text-neutral-900 dark:text-neutral-100">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.tokenManagement" })}
        </Label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="store-tokens"
              checked={storeTokens}
              onCheckedChange={(checked) => onStoreTokensChange(checked === true)}
            />
            <Label
              htmlFor="store-tokens"
              className="text-neutral-900 dark:text-neutral-100 cursor-pointer"
            >
              {intl.formatMessage({ id: "mcpServer.auth.oauth.storeTokens" })}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={(checked) => onAutoRefreshChange(checked === true)}
            />
            <Label
              htmlFor="auto-refresh"
              className="text-neutral-900 dark:text-neutral-100 cursor-pointer"
            >
              {intl.formatMessage({ id: "mcpServer.auth.oauth.autoRefresh" })}
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
