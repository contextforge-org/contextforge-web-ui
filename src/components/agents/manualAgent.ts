import type { A2AAgentCreate } from "@/generated/types";
import type { CustomHeader } from "@/components/mcp-servers/CustomHeadersAuth";

/** Authentication types, named as the API names them in `auth_type`. */
export type AgentAuthType = "none" | "basic" | "bearer" | "authheaders" | "oauth" | "query_param";

/** Order of the tabs in the manual form. */
export const AGENT_AUTH_TYPES: AgentAuthType[] = [
  "none",
  "basic",
  "bearer",
  "authheaders",
  "oauth",
  "query_param",
];

/** Protocol versions the manual form offers; the API stores the value as `protocol_version`. */
export const PROTOCOL_VERSIONS = ["1.0", "0.3"] as const;
export type ProtocolVersion = (typeof PROTOCOL_VERSIONS)[number];

export interface AgentAuthValues {
  token: string;
  username: string;
  password: string; // pragma: allowlist secret
  headers: CustomHeader[];
  queryParamName: string;
  queryParamValue: string;
  oauthTokenUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthScopes: string;
}

/** "a, b ,, c" → ["a", "b", "c"]. Splits on commas or whitespace when `whitespace` is set. */
export function parseList(value: string, whitespace = false): string[] {
  return value
    .split(whitespace ? /[\s,]+/ : ",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Whether the credentials the chosen type needs are all there. */
export function hasRequiredCredentials(type: AgentAuthType | null, c: AgentAuthValues): boolean {
  switch (type) {
    case "bearer":
      return Boolean(c.token.trim());
    case "basic":
      return Boolean(c.username.trim() && c.password);
    case "authheaders":
      return c.headers.length > 0 && c.headers.every((h) => h.key.trim() && h.value);
    case "query_param":
      return Boolean(c.queryParamName.trim() && c.queryParamValue);
    case "oauth":
      return Boolean(c.oauthTokenUrl.trim() && c.oauthClientId.trim() && c.oauthClientSecret);
    default:
      return true;
  }
}

/** The `A2AAgentCreate` auth fields for the chosen type; empty for none. */
export function credentialFields(
  type: AgentAuthType | null,
  c: AgentAuthValues,
): Partial<A2AAgentCreate> {
  switch (type) {
    case "bearer":
      return { auth_type: "bearer", auth_token: c.token.trim() };
    case "basic":
      return { auth_type: "basic", auth_username: c.username.trim(), auth_password: c.password }; // pragma: allowlist secret
    case "authheaders":
      return {
        auth_type: "authheaders",
        auth_headers: c.headers.map(({ key, value }) => ({ key: key.trim(), value })),
      };
    case "query_param":
      return {
        auth_type: "query_param",
        auth_query_param_key: c.queryParamName.trim(),
        auth_query_param_value: c.queryParamValue,
      };
    case "oauth":
      return {
        auth_type: "oauth",
        oauth_config: {
          grant_type: "client_credentials",
          client_id: c.oauthClientId.trim(),
          client_secret: c.oauthClientSecret, // pragma: allowlist secret
          token_url: c.oauthTokenUrl.trim(),
          scopes: parseList(c.oauthScopes, true),
        },
      };
    default:
      return {};
  }
}
