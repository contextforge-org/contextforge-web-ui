/**
 * The skills an agent advertises, as display names.
 *
 * The API exposes them as a top-level `skills` list (IBM/mcp-context-forge#7433)
 * and, for agents stored before that field existed, inside
 * `capabilities.skills`. The top-level list wins when both are present.
 * Entries are skill objects (`name`, falling back to `id`) or plain strings;
 * anything else, and blank names, are dropped.
 */
export function getAgentSkillNames(agent: { skills?: unknown; capabilities?: unknown }): string[] {
  const capabilities = agent.capabilities;
  const nested =
    capabilities && typeof capabilities === "object"
      ? (capabilities as { skills?: unknown }).skills
      : undefined;
  const source = Array.isArray(agent.skills) ? agent.skills : nested;
  if (!Array.isArray(source)) return [];

  return source
    .map((entry): string => {
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
