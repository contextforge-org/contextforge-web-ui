/**
 * Types for `POST /v1/a2a/fetch-card`, which reads an A2A Agent Card from an
 * endpoint that is not registered yet.
 *
 * Hand-written on purpose: the route is added by IBM/mcp-context-forge#7377 and
 * is not in the generated client yet. Replace these with the generated types
 * once `openapi.json` is regenerated from a gateway that includes it.
 *
 * Top-level keys are camelCase like the rest of the API. `suggestedAgent` is a
 * plain mapping onto `A2AAgentCreate`, so it reuses that generated type.
 */
import type { A2AAgentCreate } from "@/generated/types";

export type FetchCardOutcome = "found" | "no_card" | "auth_required" | "unreachable";

export interface AgentCardSkill {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
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

export interface AgentCardExtension {
  uri: string;
  description?: string;
  required?: boolean;
}

/** A JWS signature over the card. The gateway does not verify it. */
export interface AgentCardSignature {
  protected: string;
  signature: string;
}

/**
 * One security scheme. A 1.0 card wraps each scheme's body under exactly one of
 * these keys (a protobuf `oneof`).
 */
export interface AgentCardSecurityScheme {
  httpAuthSecurityScheme?: { scheme?: string; bearerFormat?: string; description?: string };
  apiKeySecurityScheme?: { name?: string; location?: string; description?: string };
  oauth2SecurityScheme?: { description?: string; flows?: Record<string, object> };
  openIdConnectSecurityScheme?: { openIdConnectUrl?: string; description?: string };
  mtlsSecurityScheme?: { description?: string };
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
  /** Keyed by scheme name. */
  securitySchemes?: Record<string, AgentCardSecurityScheme>;
  /** Alternatives: any one requirement, each naming schemes (with scopes) that must all be satisfied. */
  securityRequirements?: Array<{ schemes?: Record<string, { list?: string[] }> }>;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    extensions?: AgentCardExtension[];
  };
  /** Media types the agent accepts and returns unless a skill says otherwise. */
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  /** Present when the card is signed. */
  signatures?: AgentCardSignature[];
}

/** Credential-free `A2AAgentCreate` fields derived from a card. */
export type SuggestedAgent = Partial<A2AAgentCreate>;

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
  suggestedAgent?: SuggestedAgent | null;
  /** Card content ContextForge could not map. */
  warnings?: string[];
}

/**
 * `GET /v1/a2a/{id}/card`: the card the gateway builds for a registered agent.
 * It is generated from what the gateway stores, so unlike `AgentCard` it carries
 * no security schemes; the agent's `authType` says how it is called.
 */
export interface RegisteredAgentCard {
  name: string;
  description?: string;
  version?: string;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  capabilities?: Record<string, unknown>;
  skills?: AgentCardSkill[];
}
