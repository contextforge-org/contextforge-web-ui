import { useIntl } from "react-intl";
import { BasicAuth } from "@/components/mcp-servers/BasicAuth";
import { BearerTokenAuth } from "@/components/mcp-servers/BearerTokenAuth";
import { CustomHeadersAuth } from "@/components/mcp-servers/CustomHeadersAuth";
import { QueryParameterAuth } from "@/components/mcp-servers/QueryParameterAuth";
import { SegmentedRadio } from "@/components/ui/segmented-radio";
import type { AgentAuthType, AgentAuthValues } from "./manualAgent";

/** Tab label ids reuse the MCP server form's, so every form words the auth types alike. */
export const AUTH_TYPE_LABEL_IDS: Record<AgentAuthType, string> = {
  none: "mcpServer.advanced.authType.none",
  basic: "mcpServer.advanced.authType.basic",
  bearer: "mcpServer.advanced.authType.bearer",
  authheaders: "mcpServer.advanced.authType.custom",
  oauth: "mcpServer.advanced.authType.oauth", // pragma: allowlist secret
  query_param: "mcpServer.advanced.authType.query",
};

interface AgentAuthFieldsProps {
  /** The auth types to offer, in tab order. */
  types: AgentAuthType[];
  type: AgentAuthType;
  onTypeChange: (type: AgentAuthType) => void;
  values: AgentAuthValues;
  onChange: (patch: Partial<AgentAuthValues>) => void;
  /** Distinguishes the ids when more than one set is on a page. */
  idPrefix?: string;
}

/** The credential type tabs and the fields of the chosen type. */
export function AgentAuthFields({
  types,
  type,
  onTypeChange,
  values,
  onChange,
  idPrefix = "agent-auth",
}: AgentAuthFieldsProps) {
  const intl = useIntl();

  const renderFields = () => {
    switch (type) {
      case "basic":
        return (
          <BasicAuth
            username={values.username}
            password={values.password}
            onUsernameChange={(username) => onChange({ username })}
            onPasswordChange={(password) => onChange({ password })}
          />
        );
      case "bearer":
        return (
          <BearerTokenAuth token={values.token} onTokenChange={(token) => onChange({ token })} />
        );
      case "authheaders":
        return (
          <CustomHeadersAuth
            headers={values.headers}
            onHeadersChange={(headers) => onChange({ headers })}
          />
        );
      case "query_param":
        return (
          <QueryParameterAuth
            parameterName={values.queryParamName}
            apiKey={values.queryParamValue}
            onParameterNameChange={(queryParamName) => onChange({ queryParamName })}
            onApiKeyChange={(queryParamValue) => onChange({ queryParamValue })}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <SegmentedRadio
        idPrefix={idPrefix}
        label={intl.formatMessage({ id: "mcpServer.advanced.authTypeLabel" })}
        options={types.map((option) => ({
          value: option,
          label: intl.formatMessage({ id: AUTH_TYPE_LABEL_IDS[option] }),
          wide: option === "authheaders" || option === "query_param",
        }))}
        value={type}
        onChange={onTypeChange}
      />
      {renderFields()}
    </div>
  );
}
