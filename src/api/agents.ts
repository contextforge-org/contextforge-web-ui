/**
 * A2A agents API service
 */

import { api } from "./client";
import type { A2AAgentRead } from "@/generated/types";

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
