import type { A2AAgentReadCapabilities } from "@/generated/types";

/** A skill as the API lists it: an object (`name`, falling back to `id`) or a plain string. */
export type AgentSkillEntry = string | { name?: string; id?: string };

export interface AgentSkillSource {
  /** Top-level skills list (IBM/mcp-context-forge#7433). */
  skills?: readonly AgentSkillEntry[] | null;
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

/** A skill as the API stores it (`A2AAgentSkill`); `examples` is an extra field the API keeps. */
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

/** The API's limits on an agent's skills (IBM/mcp-context-forge#7433). */
export const SKILL_LIMITS = {
  skills: 100,
  tags: 50,
  text: 255,
  description: 8192,
} as const;

/**
 * The id a skill gets from its name: lower case, runs of anything else
 * collapsed to one underscore ("Production routing" → "production_routing").
 * Empty when the name has no letters or digits to build one from.
 */
export function deriveSkillId(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SKILL_LIMITS.text);
}

/** The API rejects markup in a skill's id, name, description and tags. */
const MARKUP = /[<>]/;

export type SkillDraftError =
  | "nameRequired"
  | "nameTooLong"
  | "nameMarkup"
  | "nameNoId"
  | "duplicateId"
  | "descriptionRequired"
  | "descriptionTooLong"
  | "descriptionMarkup"
  | "tagsRequired"
  | "tagsTooMany"
  | "tagTooLong"
  | "tagMarkup"
  | "examplesTooLong"
  | "examplesMarkup"
  | "tooManySkills";

export type SkillDraftErrors = Partial<
  Record<"name" | "description" | "tags" | "examples" | "form", SkillDraftError>
>;

export interface SkillDraft {
  name: string;
  description: string;
  tags: string[];
  examples: string[];
}

/**
 * Checks a new skill against the API's rules and the ids the agent already has.
 * Returns the errors by field, or `{}` when it can be sent.
 */
export function validateSkillDraft(
  draft: SkillDraft,
  existing: readonly AgentSkillEntry[],
): SkillDraftErrors {
  const errors: SkillDraftErrors = {};
  const name = draft.name.trim();
  const description = draft.description.trim();

  if (!name) errors.name = "nameRequired";
  else if (name.length > SKILL_LIMITS.text) errors.name = "nameTooLong";
  else if (MARKUP.test(name)) errors.name = "nameMarkup";
  else {
    const id = deriveSkillId(name);
    if (!id) errors.name = "nameNoId";
    else if (existing.some((entry) => typeof entry === "object" && entry?.id === id)) {
      errors.name = "duplicateId";
    }
  }

  if (!description) errors.description = "descriptionRequired";
  else if (description.length > SKILL_LIMITS.description) errors.description = "descriptionTooLong";
  else if (MARKUP.test(description)) errors.description = "descriptionMarkup";

  if (draft.tags.length === 0) errors.tags = "tagsRequired";
  else if (draft.tags.length > SKILL_LIMITS.tags) errors.tags = "tagsTooMany";
  else if (draft.tags.some((tag) => tag.length > SKILL_LIMITS.text)) errors.tags = "tagTooLong";
  else if (draft.tags.some((tag) => MARKUP.test(tag))) errors.tags = "tagMarkup";

  if (draft.examples.some((example) => example.length > SKILL_LIMITS.description)) {
    errors.examples = "examplesTooLong";
  } else if (draft.examples.some((example) => MARKUP.test(example))) {
    errors.examples = "examplesMarkup";
  }

  if (existing.length >= SKILL_LIMITS.skills) errors.form = "tooManySkills";
  return errors;
}

/** The skill to send for a valid draft; its id comes from the name. */
export function buildSkill(draft: SkillDraft): AgentSkill {
  const name = draft.name.trim();
  const examples = draft.examples.map((example) => example.trim()).filter(Boolean);
  return {
    id: deriveSkillId(name),
    name,
    description: draft.description.trim(),
    tags: draft.tags,
    ...(examples.length > 0 ? { examples } : {}),
  };
}
