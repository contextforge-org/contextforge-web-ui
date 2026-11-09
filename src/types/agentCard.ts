/**
 * Types for `POST /v1/a2a/fetch-card`, which reads an A2A Agent Card from an
 * endpoint that is not registered yet.
 *
 * Hand-written on purpose: the route is added by IBM/mcp-context-forge#7377 and
 * is not in the generated client yet. Replace these with the generated types
 * once `openapi.json` is regenerated from a gateway that includes it.
 *
 * Top-level keys are camelCase like the rest of the API. `suggestedAgent` is a
 * plain mapping onto `A2AAgentCreate`, so its keys are that schema's snake_case
 * field names.
 */

export type FetchCardOutcome = "found" | "no_card" | "auth_required" | "unreachable";

export interface AgentCardSkill {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
}

export interface AgentCardInterface {
  url: string;
  protocolBinding?: string;
  protocolVersion?: string;
}

export interface AgentCardProvider {
  organization?: string;
  url?: string;
}

/** An Agent Card normalized to the A2A 1.0 shape. Only the fields the UI reads are typed. */
export interface AgentCard {
  name: string;
  description?: string;
  version?: string;
  provider?: AgentCardProvider;
  documentationUrl?: string;
  supportedInterfaces?: AgentCardInterface[];
  skills?: AgentCardSkill[];
  /**
   * Keyed by scheme name. Each value wraps its body under one oneof key such as
   * `httpAuthSecurityScheme`, `apiKeySecurityScheme` or `oauth2SecurityScheme`.
   */
  securitySchemes?: Record<string, Record<string, Record<string, unknown>>>;
  /** Alternatives: any one requirement, each naming schemes (with scopes) that must all be satisfied. */
  securityRequirements?: Array<{ schemes?: Record<string, { list?: string[] }> }>;
  capabilities?: Record<string, unknown>;
}

/** Credential-free `A2AAgentCreate` fields derived from a card. */
export interface SuggestedAgent {
  name?: string;
  description?: string;
  endpoint_url?: string;
  protocol_version?: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  auth_type?: string | null;
  auth_query_param_key?: string;
  auth_header_key?: string;
  oauth_config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FetchCardResult {
  found: boolean;
  outcome: FetchCardOutcome;
  reason?: string | null;
  /** `WWW-Authenticate` scheme name. Set only when `outcome` is `auth_required`. */
  authScheme?: string | null;
  sourceUrl?: string | null;
  /** Card format version detected: "1.0" or "0.3". */
  detectedVersion?: string | null;
  card?: AgentCard | null;
  rawCard?: Record<string, unknown> | null;
  suggestedAgent?: SuggestedAgent | null;
  /** Card content ContextForge could not map. */
  warnings?: string[];
}
