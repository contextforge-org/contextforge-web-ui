import type { AgentUpdateBody } from "@/api/agents";
import type { Visibility } from "@/types/server";
import {
  AGENT_AUTH_TYPES,
  credentialFields,
  type AgentAuthType,
  type AgentAuthValues,
  type ProtocolBinding,
} from "./manualAgent";

/** The binding the gateway reports, as one the form knows. Unset or unknown reads as `null`. */
export function toProtocolBinding(value: string | null | undefined): ProtocolBinding | null {
  return value === "jsonrpc" || value === "http_json" ? value : null;
}

/** What the edit form shows for an agent, taken from what the gateway holds. */
export interface EditableAgent {
  name: string;
  description: string;
  endpointUrl: string;
  protocolVersion: string;
  /** `null` while the agent has none set, and the gateway picks one from the agent type and URL. */
  protocolBinding: ProtocolBinding | null;
  tags: string[];
  visibility: Visibility;
  teamId: string | undefined;
}

/** What the user has in the form. */
export type EditValues = EditableAgent;

/**
 * What to do with the stored credential. The gateway never returns one, so the form
 * cannot show it: it either leaves the credential alone or replaces it with what is typed.
 */
export type CredentialChange =
  { kind: "keep" } | { kind: "replace"; type: AgentAuthType; values: AgentAuthValues };

/** The auth type the gateway reports, as one the form knows. Unknown or absent reads as none. */
export function toAuthType(value: string | null | undefined): AgentAuthType {
  return (AGENT_AUTH_TYPES as readonly string[]).includes(value ?? "")
    ? (value as AgentAuthType)
    : "none";
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * The `PUT` body for an edit: only what differs from the stored agent, so a submit with
 * nothing touched sends nothing. Never carries `capabilities` or `skills`, which the form
 * does not manage and the gateway would otherwise replace.
 */
export function buildAgentUpdate(
  original: EditableAgent,
  values: EditValues,
  credential: CredentialChange,
): AgentUpdateBody {
  const body: AgentUpdateBody = {};

  const name = values.name.trim();
  if (name !== original.name) body.name = name;

  const endpoint = values.endpointUrl.trim();
  if (endpoint !== original.endpointUrl) body.endpoint_url = endpoint;

  const description = values.description.trim();
  if (description !== original.description.trim()) body.description = description;

  if (values.protocolVersion !== original.protocolVersion) {
    body.protocol_version = values.protocolVersion;
  }

  if (values.protocolBinding && values.protocolBinding !== original.protocolBinding) {
    body.protocol_binding = values.protocolBinding;
  }

  if (!sameList(values.tags, original.tags)) body.tags = values.tags;

  // The gateway checks the name against the visibility it is sent, so a team goes with it.
  const teamChanged = values.visibility === "team" && values.teamId !== original.teamId;
  if (values.visibility !== original.visibility || teamChanged) {
    body.visibility = values.visibility;
    if (values.visibility === "team") body.team_id = values.teamId;
  }

  if (credential.kind === "replace") {
    // "none" has no fields of its own; sending the type alone clears the stored credential.
    Object.assign(
      body,
      credential.type === "none"
        ? { auth_type: "none" }
        : credentialFields(credential.type, credential.values),
    );
  }

  return body;
}

/** Whether a body changes anything. */
export function hasChanges(body: AgentUpdateBody): boolean {
  return Object.keys(body).length > 0;
}
