/**
 * A2A agents API service
 */

import { api } from "./client";
import type {
  A2AAgentCreate,
  A2AAgentRead,
  A2ATestResponse,
  BodyCreateA2aAgentV1A2aPost,
} from "@/generated/types";
import type { Visibility } from "@/types/server";
import type { FetchCardResult } from "@/types/agentCard";

/**
 * Validates an agent ID to prevent path traversal and injection attacks
 * @param id - The agent ID to validate
 * @returns The validated ID
 * @throws Error if the ID is invalid
 */
function validateAgentId(id: string): string {
  if (!id || typeof id !== "string") {
    throw new Error("Invalid agent ID");
  }

  if (id.length > 255) {
    throw new Error("Agent ID too long");
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid agent ID format");
  }

  return id;
}

/**
 * The body of `PUT /v1/a2a/{id}`. A partial update: a field left out is kept. The
 * gateway accepts snake_case and camelCase keys, so the create fields are reused, with
 * `visibility` and `team_id` beside them as the update route takes them in the body.
 * `capabilities` and `skills` are never sent from the edit form.
 */
export type AgentUpdateBody = Partial<A2AAgentCreate> & {
  visibility?: Visibility;
  team_id?: string | null;
};

export const agentsApi = {
  /**
   * Read an Agent Card from an endpoint that is not registered yet.
   *
   * A reachable host that publishes no card, one that wants credentials, and an
   * unreachable one all come back as 200 with a distinct `outcome`; only a
   * missing permission or a malformed request is an error. `headers` carry a
   * credential for a card that needs one.
   */
  fetchCard: (baseUrl: string, headers?: Record<string, string>): Promise<FetchCardResult> => {
    return api.post("/v1/a2a/fetch-card", headers ? { baseUrl, headers } : { baseUrl });
  },

  /**
   * Register an agent. The route embeds its body parameters, so the agent
   * fields travel under `agent` beside `team_id` and `visibility`.
   */
  create: (body: BodyCreateA2aAgentV1A2aPost): Promise<A2AAgentRead> => {
    return api.post("/v1/a2a", body);
  },

  /**
   * Enable or disable an agent. Returns the agent as stored after the change.
   */
  setState: (id: string, activate: boolean): Promise<A2AAgentRead> => {
    const validId = validateAgentId(id);
    return api.post(`/v1/a2a/${validId}/state?activate=${activate}`);
  },

  /**
   * Replace an agent's tags. The update route takes partial bodies, so only
   * `tags` is sent. Returns the agent as stored, for its normalized tags.
   */
  updateTags: (id: string, tags: string[]): Promise<A2AAgentRead> => {
    return api.put(`/v1/a2a/${validateAgentId(id)}`, { tags });
  },

  /**
   * Call an agent with a test message. The service chooses the request body
   * from the agent's type, so only the optional `query` travels. It is sent
   * as typed; an empty or blank one is left out and the service sends its
   * default, which makes this a connectivity check. The call reaches the agent: it counts in the agent's
   * metrics, updates its last interaction, and can create a task.
   */
  test: (id: string, query?: string, signal?: AbortSignal): Promise<A2ATestResponse> => {
    const body = query?.trim() ? { query } : {};
    return api.post(`/v1/a2a/${validateAgentId(id)}/test`, body, { signal });
  },

  /**
   * Edit an agent. Send only the fields that changed. A credential field must travel
   * with `auth_type`, or the gateway rejects the request.
   */
  update: (id: string, body: AgentUpdateBody): Promise<A2AAgentRead> => {
    return api.put(`/v1/a2a/${validateAgentId(id)}`, body);
  },

  /** Remove one plugin binding. */
  deletePluginBinding: (bindingId: string): Promise<void> => {
    return api.delete(`/v1/a2a-agents/plugin-bindings/${validateAgentId(bindingId)}`);
  },

  /**
   * Delete an agent
   */
  delete: (id: string): Promise<void> => {
    const validId = validateAgentId(id);
    return api.delete(`/v1/a2a/${validId}`);
  },
};
