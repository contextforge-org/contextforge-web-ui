/**
 * A2A agents API service
 */

import { api } from "./client";
import type { A2AAgentRead, BodyCreateA2aAgentV1A2aPost } from "@/generated/types";
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

export const agentsApi = {
  /**
   * Read an Agent Card from an endpoint that is not registered yet.
   *
   * A reachable host that publishes no card, one that wants credentials, and an
   * unreachable one all come back as 200 with a distinct `outcome`; only a
   * missing permission or a malformed request is an error.
   */
  fetchCard: (baseUrl: string): Promise<FetchCardResult> => {
    return api.post("/v1/a2a/fetch-card", { baseUrl });
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
   * Delete an agent
   */
  delete: (id: string): Promise<void> => {
    const validId = validateAgentId(id);
    return api.delete(`/v1/a2a/${validId}`);
  },
};
