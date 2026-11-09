import { useIntl } from "react-intl";
import { BasicAuth } from "@/components/mcp-servers/BasicAuth";
import { BearerTokenAuth } from "@/components/mcp-servers/BearerTokenAuth";
import { CustomHeadersAuth } from "@/components/mcp-servers/CustomHeadersAuth";
import { QueryParameterAuth } from "@/components/mcp-servers/QueryParameterAuth";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ConnectAgentFormState } from "@/hooks/useConnectAgentForm";
import { VisibilityFields } from "./VisibilityFields";
import {
  AGENT_AUTH_TYPES,
  PROTOCOL_VERSIONS,
  type AgentAuthType,
  type ProtocolVersion,
} from "./manualAgent";

const INPUT_CLASS =
  "rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500";

/** Tab label ids reuse the MCP server form's, so the two forms word the auth types alike. */
const AUTH_TAB_LABEL_IDS: Record<AgentAuthType, string> = {
  none: "mcpServer.advanced.authType.none",
  basic: "mcpServer.advanced.authType.basic",
  bearer: "mcpServer.advanced.authType.bearer",
  authheaders: "mcpServer.advanced.authType.custom",
  oauth: "mcpServer.advanced.authType.oauth", // pragma: allowlist secret
  query_param: "mcpServer.advanced.authType.query",
};

function AuthTypeTabs({
  value,
  onChange,
}: {
  value: AgentAuthType;
  onChange: (value: AgentAuthType) => void;
}) {
  const intl = useIntl();
  return (
    <div className="flex flex-col gap-2.5">
      <Label id="agent-auth-type-label">
        {intl.formatMessage({ id: "mcpServer.advanced.authTypeLabel" })}
      </Label>
      <div
        role="radiogroup"
        aria-labelledby="agent-auth-type-label"
        className="flex w-full flex-nowrap gap-1 overflow-x-auto rounded-md bg-neutral-100 p-1 dark:bg-neutral-800"
      >
        {AGENT_AUTH_TYPES.map((type) => (
          <div
            key={type}
            className={
              type === "authheaders" || type === "query_param"
                ? "min-w-fit flex-[1.3]"
                : "min-w-fit flex-1"
            }
          >
            <input
              type="radio"
              id={`agent-auth-${type}`}
              name="agent-auth-type"
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
              className="peer sr-only"
            />
            <label
              htmlFor={`agent-auth-${type}`}
              className="flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2 py-2 text-center text-sm font-medium text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700 peer-checked:bg-neutral-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-300 dark:peer-checked:bg-neutral-950 dark:peer-checked:text-white"
            >
              {intl.formatMessage({ id: AUTH_TAB_LABEL_IDS[type] })}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  error,
  info,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  error?: string;
  info?: string;
}) {
  return (
    <Field
      id={id}
      label={label}
      required={required}
      error={error}
      info={info}
      labelProps={info ? { className: "inline-flex items-center gap-0.5" } : undefined}
    >
      {(controlProps) => (
        <Input
          {...controlProps}
          type={type}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={INPUT_CLASS}
        />
      )}
    </Field>
  );
}

function OAuthClientCredentialsFields({ form }: { form: ConnectAgentFormState }) {
  const intl = useIntl();
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {intl.formatMessage({ id: "agents.connect.manual.oauth.intro" })}
      </p>
      <TextField
        id="agent-oauth-token-url"
        required
        type="url"
        label={intl.formatMessage({ id: "agents.connect.manual.oauth.tokenUrl" })}
        placeholder="https://auth.example.com/oauth/token"
        value={form.oauthTokenUrl}
        onChange={form.setOauthTokenUrl}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="agent-oauth-client-id"
          required
          label={intl.formatMessage({ id: "agents.connect.manual.oauth.clientId" })}
          placeholder={intl.formatMessage({
            id: "agents.connect.manual.oauth.clientIdPlaceholder",
          })}
          value={form.oauthClientId}
          onChange={form.setOauthClientId}
        />
        <TextField
          id="agent-oauth-client-secret"
          required
          type="password"
          label={intl.formatMessage({ id: "agents.connect.manual.oauth.clientSecret" })}
          placeholder={intl.formatMessage({
            id: "agents.connect.manual.oauth.clientSecretPlaceholder",
          })}
          value={form.oauthClientSecret}
          onChange={form.setOauthClientSecret}
        />
      </div>
      <TextField
        id="agent-oauth-scopes"
        label={intl.formatMessage({ id: "agents.connect.manual.oauth.scopes" })}
        placeholder={intl.formatMessage({ id: "agents.connect.manual.oauth.scopesPlaceholder" })}
        value={form.oauthScopes}
        onChange={form.setOauthScopes}
      />
    </div>
  );
}

/** The fields for registering an agent that publishes no Agent Card. */
export function ManualAgentFields({ form }: { form: ConnectAgentFormState }) {
  const intl = useIntl();

  const renderAuth = () => {
    switch (form.manualAuthType) {
      case "basic":
        return (
          <BasicAuth
            username={form.username}
            password={form.password}
            onUsernameChange={form.setUsername}
            onPasswordChange={form.setPassword}
          />
        );
      case "bearer":
        return <BearerTokenAuth token={form.token} onTokenChange={form.setToken} />;
      case "authheaders":
        return <CustomHeadersAuth headers={form.headers} onHeadersChange={form.setHeaders} />;
      case "oauth":
        return <OAuthClientCredentialsFields form={form} />;
      case "query_param":
        return (
          <QueryParameterAuth
            parameterName={form.queryParamName}
            apiKey={form.queryParamValue}
            onParameterNameChange={form.setQueryParamName}
            onApiKeyChange={form.setQueryParamValue}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <TextField
        id="agent-manual-name"
        required
        label={intl.formatMessage({ id: "agents.connect.manual.name.label" })}
        placeholder={intl.formatMessage({ id: "agents.connect.manual.name.placeholder" })}
        value={form.manualName}
        onChange={(value) => {
          form.setManualName(value);
          form.clearError("name");
        }}
        error={form.errors.name}
      />

      <VisibilityFields
        idPrefix="agent-manual"
        visibility={form.visibility}
        onVisibilityChange={form.setVisibility}
        teams={form.teams}
        teamId={form.teamId}
        onTeamChange={form.setTeamId}
        teamError={form.errors.teamId}
      />

      <TextField
        id="agent-manual-endpoint"
        required
        type="url"
        label={intl.formatMessage({ id: "agents.connect.manual.endpoint.label" })}
        info={intl.formatMessage({ id: "agents.connect.manual.endpoint.info" })}
        placeholder={intl.formatMessage({ id: "agents.connect.manual.endpoint.placeholder" })}
        value={form.manualEndpoint}
        onChange={(value) => {
          form.setManualEndpoint(value);
          form.clearError("endpoint");
        }}
        error={form.errors.endpoint}
      />

      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-2.5 text-sm font-medium text-foreground">
            {intl.formatMessage({ id: "agents.connect.manual.binding.label" })}
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          </legend>
          <RadioGroup
            value="JSONRPC"
            aria-label={intl.formatMessage({ id: "agents.connect.manual.binding.label" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="JSONRPC" id="agent-binding-jsonrpc" />
              <Label htmlFor="agent-binding-jsonrpc" className="font-normal">
                {intl.formatMessage({ id: "agents.connect.manual.binding.jsonrpc" })}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              {/* TODO(IBM/mcp-context-forge#7383): disabled because the API stores no protocol
                  binding yet, so a selection would be dropped on save. Enable this option, send
                  `protocol_binding` ("jsonrpc" | "http_json") and drop the note below once that
                  column exists in the generated client. */}
              <RadioGroupItem value="HTTP+JSON" id="agent-binding-http" disabled />
              <Label htmlFor="agent-binding-http" className="font-normal text-muted-foreground">
                {intl.formatMessage({ id: "agents.connect.manual.binding.http" })}
              </Label>
            </div>
          </RadioGroup>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2.5 text-sm font-medium text-foreground">
            {intl.formatMessage({ id: "agents.connect.manual.version.label" })}
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          </legend>
          <RadioGroup
            value={form.protocolVersion}
            onValueChange={(value) => form.setProtocolVersion(value as ProtocolVersion)}
            aria-label={intl.formatMessage({ id: "agents.connect.manual.version.label" })}
          >
            {PROTOCOL_VERSIONS.map((version) => (
              <div key={version} className="flex items-center gap-2">
                <RadioGroupItem value={version} id={`agent-version-${version}`} />
                <Label htmlFor={`agent-version-${version}`} className="font-normal">
                  {intl.formatMessage({ id: "agents.connect.manual.version.option" }, { version })}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        {/* TODO(IBM/mcp-context-forge#7383): temporary note. Remove it, and the
            `agents.connect.manual.binding.httpUnsupported` strings, once HTTP+JSON can be saved. */}
        <p className="w-full text-xs text-muted-foreground">
          {intl.formatMessage({ id: "agents.connect.manual.binding.httpUnsupported" })}
        </p>
      </div>

      <AuthTypeTabs value={form.manualAuthType} onChange={form.setManualAuthType} />
      {renderAuth()}
      {form.errors.credentials && (
        <p role="alert" className="text-sm text-destructive">
          {form.errors.credentials}
        </p>
      )}

      <div className="space-y-4">
        <TextField
          id="agent-manual-tags"
          label={intl.formatMessage({ id: "agents.connect.manual.tags.label" })}
          placeholder={intl.formatMessage({ id: "agents.connect.manual.tags.placeholder" })}
          value={form.manualTags}
          onChange={form.setManualTags}
        />

        {/* The design shows the description without a visible label; keep one for screen readers. */}
        <Field
          id="agent-manual-description"
          label={intl.formatMessage({ id: "agents.connect.manual.description.label" })}
          labelProps={{ className: "sr-only" }}
        >
          {(controlProps) => (
            <Textarea
              {...controlProps}
              value={form.manualDescription}
              onChange={(event) => form.setManualDescription(event.target.value)}
              placeholder={intl.formatMessage({
                id: "agents.connect.manual.description.placeholder",
              })}
              className="min-h-20 rounded-md border-neutral-300 px-4 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700"
            />
          )}
        </Field>
      </div>
    </div>
  );
}
