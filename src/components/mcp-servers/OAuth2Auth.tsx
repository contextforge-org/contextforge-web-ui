import { useIntl } from "react-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  // Deliberately NOT derived from window.location.origin: the browser's own
  // address is the web UI's origin, but the OAuth callback is served by the
  // gateway (mcpgateway) at its own configured APP_DOMAIN, which can differ
  // in any split deployment. Guessing wrong here means registering the wrong
  // redirect URI with the OAuth provider with no warning (see
  // mcp-context-forge#6458). When the operator hasn't set one, leave
  // redirect_uri unsubmitted (see useMCPServerForm.ts) so the gateway's own
  // default (based on its APP_DOMAIN) applies server-side instead.
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
      <div className="space-y-1">
        <label
          htmlFor="oauth-grant-type"
          className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {intl.formatMessage({ id: "mcpServer.auth.oauth.grantTypeLabel" })}
          <span className="text-destructive">*</span>
          <span className="sr-only">{intl.formatMessage({ id: "mcpServer.form.required" })}</span>
        </label>
        <Select value={grantType} onValueChange={onGrantTypeChange}>
          <SelectTrigger
            id="oauth-grant-type"
            className="h-10 w-full border-neutral-300 dark:border-neutral-700"
          >
            <SelectValue
              placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.grantTypePlaceholder" })}
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
      </div>

      {grantType === "password" && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.passwordDeprecated" })}
        </p>
      )}

      <div className="space-y-1">
        <label
          htmlFor="oauth-issuer-url"
          className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlLabel" })}
          <span className="text-destructive">*</span>
          <span className="sr-only">{intl.formatMessage({ id: "mcpServer.form.required" })}</span>
        </label>
        <Input
          id="oauth-issuer-url"
          type="text"
          value={issuerUrl}
          onChange={(e) => onIssuerUrlChange(e.target.value)}
          placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlPlaceholder" })}
          className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <p className="text-xs text-neutral-600 dark:text-neutral-500">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.issuerUrlHelp" })}
        </p>
      </div>

      {grantType === "authorization_code" && (
        <div className="space-y-1">
          <label
            htmlFor="oauth-redirect-uri"
            className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
          >
            {intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriLabel" })}
          </label>
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
              value={intl.formatMessage({ id: "mcpServer.auth.oauth.redirectUriAutoPlaceholder" })}
              className="rounded-md border-neutral-300 px-4 text-sm text-neutral-500 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700 dark:text-neutral-500"
            />
          )}
          {!hasStoredRedirectUri && (
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
          <div className="space-y-1">
            <label
              htmlFor="oauth-username"
              className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
            >
              {intl.formatMessage({ id: "mcpServer.auth.oauth.usernameLabel" })}
              <span className="text-destructive">*</span>
              <span className="sr-only">
                {intl.formatMessage({ id: "mcpServer.form.required" })}
              </span>
            </label>
            <Input
              id="oauth-username"
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.usernamePlaceholder" })}
              aria-invalid={!!errors?.username}
              aria-describedby={errors?.username ? "oauth-username-error" : undefined}
              className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
            {errors?.username && (
              <p id="oauth-username-error" className="text-sm text-destructive">
                {errors.username}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label
              htmlFor="oauth-password"
              className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
            >
              {intl.formatMessage({ id: "mcpServer.auth.oauth.passwordLabel" })}
              <span className="text-destructive">*</span>
              <span className="sr-only">
                {intl.formatMessage({ id: "mcpServer.form.required" })}
              </span>
            </label>
            <Input
              id="oauth-password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              aria-invalid={!!errors?.password}
              aria-describedby={errors?.password ? "oauth-password-error" : undefined}
              className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
            {errors?.password && (
              <p id="oauth-password-error" className="text-sm text-destructive">
                {errors.password}
              </p>
            )}
          </div>
        </>
      )}

      <div className="space-y-1">
        <label
          htmlFor="oauth-client-id"
          className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {intl.formatMessage({ id: "mcpServer.auth.oauth.clientIdLabel" })}
        </label>
        <Input
          id="oauth-client-id"
          type="text"
          value={clientId}
          onChange={(e) => onClientIdChange(e.target.value)}
          placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.clientIdPlaceholder" })}
          className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <p className="text-xs text-neutral-600 dark:text-neutral-500">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.dcrHelp" })}
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="oauth-client-secret"
          className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {intl.formatMessage({ id: "mcpServer.auth.oauth.clientSecretLabel" })}
        </label>
        <Input
          id="oauth-client-secret"
          type="password"
          value={clientSecret}
          onChange={(e) => onClientSecretChange(e.target.value)}
          placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.clientSecretPlaceholder" })}
          className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <p className="text-xs text-neutral-600 dark:text-neutral-500">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.dcrHelp" })}
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="oauth-token-url"
          className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlLabel" })}
          <span className="text-destructive">*</span>
          <span className="sr-only">{intl.formatMessage({ id: "mcpServer.form.required" })}</span>
        </label>
        <Input
          id="oauth-token-url"
          type="text"
          value={tokenUrl}
          onChange={(e) => onTokenUrlChange(e.target.value)}
          placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlPlaceholder" })}
          className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <p className="text-xs text-neutral-600 dark:text-neutral-500">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.tokenUrlHelp" })}
        </p>
      </div>

      {grantType === "authorization_code" && (
        <div className="space-y-1">
          <label
            htmlFor="oauth-authorization-url"
            className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
          >
            {intl.formatMessage({ id: "mcpServer.auth.oauth.authorizationUrlLabel" })}
            <span className="text-destructive">*</span>
            <span className="sr-only">{intl.formatMessage({ id: "mcpServer.form.required" })}</span>
          </label>
          <Input
            id="oauth-authorization-url"
            type="text"
            value={authorizationUrl}
            onChange={(e) => onAuthorizationUrlChange(e.target.value)}
            placeholder={intl.formatMessage({
              id: "mcpServer.auth.oauth.authorizationUrlPlaceholder",
            })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <p className="text-xs text-neutral-600 dark:text-neutral-500">
            {intl.formatMessage({ id: "mcpServer.auth.oauth.authorizationUrlHelp" })}
          </p>
        </div>
      )}

      <div className="space-y-1">
        <label
          htmlFor="oauth-scopes"
          className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {intl.formatMessage({ id: "mcpServer.auth.oauth.scopesLabel" })}
        </label>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.scopesDescription" })}
        </p>
        <Textarea
          id="oauth-scopes"
          value={scopes}
          onChange={(e) => onScopesChange(e.target.value)}
          placeholder={intl.formatMessage({ id: "mcpServer.auth.oauth.scopesPlaceholder" })}
          className="min-h-20 focus-visible:ring-1 focus-visible:ring-offset-0"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {intl.formatMessage({ id: "mcpServer.auth.oauth.tokenManagement" })}
        </label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="store-tokens"
              checked={storeTokens}
              onCheckedChange={(checked) => onStoreTokensChange(checked === true)}
            />
            <label
              htmlFor="store-tokens"
              className="text-sm text-neutral-900 dark:text-neutral-100 cursor-pointer"
            >
              {intl.formatMessage({ id: "mcpServer.auth.oauth.storeTokens" })}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={(checked) => onAutoRefreshChange(checked === true)}
            />
            <label
              htmlFor="auto-refresh"
              className="text-sm text-neutral-900 dark:text-neutral-100 cursor-pointer"
            >
              {intl.formatMessage({ id: "mcpServer.auth.oauth.autoRefresh" })}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
