import type { A2AAgentReadCapabilities } from "@/generated/types";

/** A skill as the API lists it: an object (`name`, falling back to `id`) or a plain string. */
export type AgentSkillEntry = string | { name?: string; id?: string };

export interface AgentSkillSource {
  /** Top-level skills list (IBM/mcp-context-forge#7433), not in the generated type yet. */
  skills?: readonly AgentSkillEntry[];
  capabilities?: A2AAgentReadCapabilities | null;
}

/**
 * The skills an agent advertises, as display names.
 *
 * The API exposes them as a top-level `skills` list (IBM/mcp-context-forge#7433)
 * and, for agents stored before that field existed, inside
 * `capabilities.skills`, which the generated type leaves untyped. The top-level
 * list wins when it has entries; an empty one falls back to the nested list.
 * Anything unreadable, and blank names, are dropped.
 */
export function getAgentSkillNames(agent: AgentSkillSource): string[] {
  const nested = agent.capabilities?.skills;
  const source = agent.skills?.length ? agent.skills : nested;
  if (!Array.isArray(source)) return [];

  return source
    .map((entry: unknown): string => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        const { name, id } = entry as { name?: unknown; id?: unknown };
        if (typeof name === "string") return name;
        if (typeof id === "string") return id;
      }
      return "";
    })
    .map((name) => name.trim())
    .filter(Boolean);
}
