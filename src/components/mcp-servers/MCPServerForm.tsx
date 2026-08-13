import { useCallback, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { ChevronDown, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MCPIcon } from "@/components/icons/MCPIcon";
import { AdvancedSettings } from "@/components/mcp-servers/AdvancedSettings";
import { ExposeComponentsForm } from "@/components/gateways/ExposeComponentsForm";
import { useRouter } from "@/router";
import { useMCPServerForm, type TransportType } from "@/hooks/useMCPServerForm";

interface MCPServerFormProps {
  isOpen: boolean;
  onToggle: () => void;
  serverId?: string;
  onSuccess?: () => void;
}

interface CreatedGatewayInfo {
  id: string;
  name: string;
}

export function MCPServerForm({ isOpen, onToggle, serverId, onSuccess }: MCPServerFormProps) {
  const intl = useIntl();
  const { navigate } = useRouter();
  const [createdGateway, setCreatedGateway] = useState<CreatedGatewayInfo | null>(null);
  const {
    fetchError,
    name,
    url,
    description,
    transport,
    advancedOpen,
    visibility,
    teamId,
    authType,
    oneTimeAuth,
    passthroughHeaders,
    authUsername,
    authPassword,
    errors,
    isValid,
    isSubmitting,
    oauthPending,
    oauthNotification,
    clearOAuthNotification,
    fetchToolsNotification,
    clearFetchToolsNotification,
    setName,
    setUrl,
    setDescription,
    setTransport,
    setAdvancedOpen,
    setVisibility,
    setTeamId,
    setAuthType,
    setOneTimeAuth,
    setPassthroughHeaders,
    setAuthUsername,
    setAuthPassword,
    handleSubmit,
    bearerToken,
    setBearerToken,
    customHeaders,
    setCustomHeaders,
    oauthClientId,
    setOAuthClientId,
    oauthClientSecret,
    setOAuthClientSecret,
    oauthTokenUrl,
    setOAuthTokenUrl,
    oauthGrantType,
    setOAuthGrantType,
    oauthIssuerUrl,
    setOAuthIssuerUrl,
    oauthRedirectUri,
    setOAuthRedirectUri,
    oauthAuthorizationUrl,
    setOAuthAuthorizationUrl,
    oauthScopes,
    setOAuthScopes,
    oauthStoreTokens,
    setOAuthStoreTokens,
    oauthAutoRefresh,
    setOAuthAutoRefresh,
    oauthUsername,
    setOAuthUsername,
    oauthPassword,
    setOAuthPassword,
    queryParamName,
    setQueryParamName,
    queryParamApiKey,
    setQueryParamApiKey,
  } = useMCPServerForm(serverId);

  const handleRedirectUriChange = useCallback(
    (uri: string) => {
      setOAuthRedirectUri(uri);
    },
    [setOAuthRedirectUri],
  );

  const handleCancel = () => {
    setCreatedGateway(null);
    onToggle();
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    handleSubmit(event, (response) => {
      // After successful creation, show the expose components form
      if (!serverId && response) {
        const gatewayId = (response as { id?: string })?.id;
        if (!gatewayId) {
          // Gateway ID is missing - this should not happen, but guard against it
          console.error("Gateway created but ID is missing from response");
          onToggle();
          return;
        }
        const gatewayInfo: CreatedGatewayInfo = {
          id: gatewayId,
          name: name,
        };
        setCreatedGateway(gatewayInfo);
      } else {
        // For edit mode, just close the form
        if (onSuccess) {
          onSuccess();
        } else {
          onToggle();
        }
      }
    });
  };

  if (!isOpen) return null;

  // Show expose components form after successful creation
  if (createdGateway) {
    return (
      <ExposeComponentsForm
        gatewayId={createdGateway.id}
        gatewayName={createdGateway.name}
        visibility={visibility}
        teamId={teamId}
        oauthNotification={oauthNotification}
        clearOAuthNotification={clearOAuthNotification}
        fetchToolsNotification={fetchToolsNotification}
        clearFetchToolsNotification={clearFetchToolsNotification}
      />
    );
  }

  return (
    <>
      <div className="mx-auto mt-6 w-full max-w-3xl rounded-xl border border-neutral-200 bg-inherit p-0 shadow-[0_12px_40px_rgba(15,23,42,0.12)] dark:border-neutral-800">
        <div className="flex flex-col gap-8 p-6 sm:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-orange-500 text-neutral-950 shadow-sm">
                <MCPIcon className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
                {intl.formatMessage({
                  id: serverId ? "mcpServer.form.editTitle" : "mcpServer.form.connectTitle",
                })}
              </h2>
            </div>

            <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">
              {intl.formatMessage(
                { id: "mcpServer.form.intro" },
                {
                  catalog: (chunks: ReactNode) => (
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        onToggle();
                        navigate("/app/server-catalog");
                      }}
                      className="font-medium text-cyan-700 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-800 dark:text-cyan-400 dark:decoration-cyan-700 dark:hover:text-cyan-300"
                    >
                      {chunks}
                    </Button>
                  ),
                },
              )}
            </p>
          </div>

          {fetchError && serverId && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/50">
              <p className="text-sm text-red-600 dark:text-red-400">
                {intl.formatMessage({ id: "mcpServer.form.fetchError" }, { error: fetchError })}
              </p>
            </div>
          )}

          <form className="space-y-6" onSubmit={onSubmit}>
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-950 dark:text-white">
                {intl.formatMessage({ id: "mcpServer.form.transportLabel" })}
              </label>
              <div
                role="radiogroup"
                aria-label={intl.formatMessage({ id: "mcpServer.form.transportLabel" })}
                className="flex gap-2 rounded-md bg-neutral-100 p-1 dark:bg-neutral-800"
              >
                {(["STREAMABLEHTTP", "SSE"] as TransportType[]).map((type) => {
                  const label = type === "STREAMABLEHTTP" ? "Streamable HTTP" : "SSE";
                  return (
                    <div key={type} className="flex-1">
                      <input
                        type="radio"
                        id={`transport-${type}`}
                        name="transport"
                        value={type}
                        checked={transport === type}
                        onChange={(e) => setTransport(e.target.value as TransportType)}
                        className="sr-only peer"
                      />
                      <label
                        htmlFor={`transport-${type}`}
                        className="flex cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700 peer-checked:bg-neutral-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-300 dark:peer-checked:bg-neutral-950 dark:peer-checked:text-white"
                      >
                        {label}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="server-name"
                className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
              >
                {intl.formatMessage({ id: "mcpServer.form.nameLabel" })}
                <span className="text-red-500">*</span>
                <span className="sr-only">
                  {intl.formatMessage({ id: "mcpServer.form.required" })}
                </span>
              </label>
              <Input
                id="server-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={intl.formatMessage({ id: "mcpServer.form.namePlaceholder" })}
                className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {errors.name && (
                <p id="name-error" className="text-sm text-red-500">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label
                htmlFor="server-url"
                className="inline-flex items-center gap-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100"
              >
                {intl.formatMessage({ id: "mcpServer.form.urlLabel" })}
                <span className="text-red-500">*</span>
                <span className="sr-only">
                  {intl.formatMessage({ id: "mcpServer.form.required" })}
                </span>
                <CircleAlert className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
              </label>
              <Input
                id="server-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={intl.formatMessage({ id: "mcpServer.form.urlPlaceholder" })}
                className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                aria-invalid={!!errors.url}
                aria-describedby={errors.url ? "url-error" : undefined}
              />
              {errors.url && (
                <p id="url-error" className="text-sm text-red-500">
                  {errors.url}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="server-description" className="sr-only">
                {intl.formatMessage({ id: "mcpServer.form.descriptionLabel" })}
              </label>
              <Textarea
                id="server-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={intl.formatMessage({ id: "mcpServer.form.descriptionPlaceholder" })}
                className="min-h-28 focus-visible:ring-1 focus-visible:ring-offset-0"
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? "description-error" : undefined}
              />
              {errors.description && (
                <p id="description-error" className="text-sm text-red-500">
                  {errors.description}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-5 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAdvancedOpen((current) => !current)}
                className="inline-flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:text-neutral-950 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-300"
                aria-expanded={advancedOpen}
              >
                <ChevronDown className={`h-4 w-4 transition ${advancedOpen ? "rotate-180" : ""}`} />
                {intl.formatMessage({ id: "mcpServer.form.advancedSettings" })}
              </Button>

              {advancedOpen && (
                <AdvancedSettings
                  visibility={visibility}
                  onVisibilityChange={setVisibility}
                  teamId={teamId}
                  onTeamIdChange={setTeamId}
                  authType={authType}
                  onAuthTypeChange={setAuthType}
                  basicAuthUsername={authUsername}
                  basicAuthPassword={authPassword}
                  onBasicAuthUsernameChange={setAuthUsername}
                  onBasicAuthPasswordChange={setAuthPassword}
                  bearerToken={bearerToken}
                  onBearerTokenChange={setBearerToken}
                  customHeaders={customHeaders}
                  onCustomHeadersChange={setCustomHeaders}
                  oauthClientId={oauthClientId}
                  oauthClientSecret={oauthClientSecret}
                  oauthTokenUrl={oauthTokenUrl}
                  oauthGrantType={oauthGrantType}
                  oauthIssuerUrl={oauthIssuerUrl}
                  oauthRedirectUri={oauthRedirectUri}
                  oauthAuthorizationUrl={oauthAuthorizationUrl}
                  oauthScopes={oauthScopes}
                  oauthStoreTokens={oauthStoreTokens}
                  oauthAutoRefresh={oauthAutoRefresh}
                  oauthUsername={oauthUsername}
                  oauthPassword={oauthPassword}
                  onOAuthClientIdChange={setOAuthClientId}
                  onOAuthClientSecretChange={setOAuthClientSecret}
                  onOAuthTokenUrlChange={setOAuthTokenUrl}
                  onOAuthGrantTypeChange={setOAuthGrantType}
                  onOAuthIssuerUrlChange={setOAuthIssuerUrl}
                  onOAuthRedirectUriChange={handleRedirectUriChange}
                  onOAuthAuthorizationUrlChange={setOAuthAuthorizationUrl}
                  onOAuthScopesChange={setOAuthScopes}
                  onOAuthStoreTokensChange={setOAuthStoreTokens}
                  onOAuthAutoRefreshChange={setOAuthAutoRefresh}
                  onOAuthUsernameChange={setOAuthUsername}
                  onOAuthPasswordChange={setOAuthPassword}
                  queryParamName={queryParamName}
                  queryParamApiKey={queryParamApiKey}
                  onQueryParamNameChange={setQueryParamName}
                  onQueryParamApiKeyChange={setQueryParamApiKey}
                  oneTimeAuth={oneTimeAuth}
                  onOneTimeAuthChange={setOneTimeAuth}
                  passthroughHeaders={passthroughHeaders}
                  onPassthroughHeadersChange={setPassthroughHeaders}
                  onCACertificateFilesSelected={() => {
                    // CA certificate file selection handled by AdvancedSettings
                  }}
                  oauthErrors={{
                    username: errors.oauthUsername,
                    password: errors.oauthPassword, // pragma: allowlist secret
                  }}
                />
              )}

              {errors.submit && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/50">
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
                </div>
              )}

              {oauthPending && (
                <div
                  role="status"
                  className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/50"
                >
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {intl.formatMessage({ id: "mcpServer.form.oauthPending" })}
                  </p>
                </div>
              )}

              {oauthNotification && (
                <InlineNotification
                  type={oauthNotification.type}
                  message={oauthNotification.message}
                  onDismiss={clearOAuthNotification}
                  dismissLabel={intl.formatMessage({ id: "mcpServer.form.dismissOAuth" })}
                />
              )}

              {fetchToolsNotification && (
                <InlineNotification
                  type={fetchToolsNotification.type}
                  message={fetchToolsNotification.message}
                  onDismiss={clearFetchToolsNotification}
                  dismissLabel={intl.formatMessage({ id: "mcpServer.form.dismissFetchTools" })}
                />
              )}

              <div className="flex items-center justify-end gap-3 pt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleCancel()}
                  className="h-10 rounded-md px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                >
                  {intl.formatMessage({ id: "common.button.cancel" })}
                </Button>
                <Button
                  type="submit"
                  disabled={!isValid || isSubmitting || oauthPending}
                  className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:enabled:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:enabled:bg-neutral-200"
                >
                  {intl.formatMessage({
                    id: isSubmitting
                      ? "mcpServer.form.connecting"
                      : oauthPending
                        ? "mcpServer.form.waitingOAuth"
                        : serverId
                          ? "mcpServer.form.saveChanges"
                          : "mcpServer.form.connectServer",
                  })}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
