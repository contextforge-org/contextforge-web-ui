import { useIntl } from "react-intl";
import { BasicAuth } from "@/components/mcp-servers/BasicAuth";
import { BearerTokenAuth } from "@/components/mcp-servers/BearerTokenAuth";
import { CustomHeadersAuth } from "@/components/mcp-servers/CustomHeadersAuth";
import { QueryParameterAuth } from "@/components/mcp-servers/QueryParameterAuth";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SegmentedRadio } from "@/components/ui/segmented-radio";
import type { ConnectAgentFormState } from "@/hooks/useConnectAgentForm";
import { VisibilityFields } from "./VisibilityFields";
import { TextField } from "./agentFormParts";
import { TagsAndDescriptionFields } from "./TagsAndDescriptionFields";
import {
  AGENT_AUTH_TYPES,
  PROTOCOL_VERSIONS,
  type AgentAuthType,
  type ProtocolVersion,
} from "./manualAgent";

/** Tab label ids reuse the MCP server form's, so the two forms word the auth types alike. */
const AUTH_TAB_LABEL_IDS: Record<AgentAuthType, string> = {
  none: "mcpServer.advanced.authType.none",
  basic: "mcpServer.advanced.authType.basic",
  bearer: "mcpServer.advanced.authType.bearer",
  authheaders: "mcpServer.advanced.authType.custom",
  oauth: "mcpServer.advanced.authType.oauth", // pragma: allowlist secret
  query_param: "mcpServer.advanced.authType.query",
};

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

      <SegmentedRadio
        idPrefix="agent-auth"
        label={intl.formatMessage({ id: "mcpServer.advanced.authTypeLabel" })}
        options={AGENT_AUTH_TYPES.map((type) => ({
          value: type,
          label: intl.formatMessage({ id: AUTH_TAB_LABEL_IDS[type] }),
          wide: type === "authheaders" || type === "query_param",
        }))}
        value={form.manualAuthType}
        onChange={form.setManualAuthType}
      />
      {renderAuth()}
      {form.errors.credentials && (
        <p role="alert" className="text-sm text-destructive">
          {form.errors.credentials}
        </p>
      )}

      <TagsAndDescriptionFields
        idPrefix="agent-manual"
        tags={form.manualTags}
        onTagsChange={form.setManualTags}
        description={form.manualDescription}
        onDescriptionChange={form.setManualDescription}
      />
    </div>
  );
}
