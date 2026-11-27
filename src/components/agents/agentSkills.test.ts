import { describe, it, expect } from "vitest";
import {
  buildSkill,
  deriveSkillId,
  getAgentSkillNames,
  validateSkillDraft,
  type AgentSkillSource,
  type SkillDraft,
} from "./agentSkills";

/** API data is not checked at runtime, so tests feed it values the types forbid. */
const untyped = (value: unknown) => value as AgentSkillSource;

describe("getAgentSkillNames", () => {
  it("reads names from the top-level skills list", () => {
    expect(
      getAgentSkillNames({
        skills: [
          { id: "a", name: "Echo" },
          { id: "b", name: "Route" },
        ],
      }),
    ).toEqual(["Echo", "Route"]);
  });

  it("falls back to capabilities.skills for agents without a top-level list", () => {
    expect(getAgentSkillNames({ capabilities: { skills: [{ name: "Echo" }] } })).toEqual(["Echo"]);
  });

  it("prefers the top-level list over capabilities.skills", () => {
    expect(
      getAgentSkillNames({
        skills: [{ name: "New" }],
        capabilities: { skills: [{ name: "Old" }] },
      }),
    ).toEqual(["New"]);
  });

  it("falls back to capabilities.skills when the top-level list is empty", () => {
    expect(
      getAgentSkillNames({ skills: [], capabilities: { skills: [{ name: "Echo" }] } }),
    ).toEqual(["Echo"]);
  });

  it("uses the id when a skill has no name, and accepts plain strings", () => {
    expect(getAgentSkillNames({ skills: [{ id: "echo" }, "Route"] })).toEqual(["echo", "Route"]);
  });

  it("drops blank names and entries it cannot read", () => {
    expect(
      getAgentSkillNames(untyped({ skills: [{ name: "  " }, null, 42, {}, { name: " Echo " }] })),
    ).toEqual(["Echo"]);
  });

  it.each([
    ["nothing", {}],
    ["a null capabilities", { capabilities: null }],
    ["a non-array skills value", { skills: "echo", capabilities: { skills: "echo" } }],
    ["empty lists", { skills: [], capabilities: { skills: [] } }],
  ])("returns no skills for %s", (_name, agent) => {
    expect(getAgentSkillNames(untyped(agent))).toEqual([]);
  });
});

describe("deriveSkillId", () => {
  it("lower-cases and joins words with underscores", () => {
    expect(deriveSkillId("Production routing")).toBe("production_routing");
    expect(deriveSkillId("  AI / hybrid -- routing! ")).toBe("ai_hybrid_routing");
  });

  it("drops accents and is empty when nothing usable is left", () => {
    expect(deriveSkillId("Café résumé")).toBe("cafe_resume");
    expect(deriveSkillId("!!! ???")).toBe("");
  });
});

describe("validateSkillDraft", () => {
  const draft: SkillDraft = {
    name: "Production routing",
    description: "Routes to prod",
    tags: ["routing"],
    examples: [],
  };

  it("accepts a complete skill", () => {
    expect(validateSkillDraft(draft, [])).toEqual({});
  });

  it("requires name, description and a tag", () => {
    expect(validateSkillDraft({ ...draft, name: " ", description: "", tags: [] }, [])).toEqual({
      name: "nameRequired",
      description: "descriptionRequired",
      tags: "tagsRequired",
    });
  });

  it("flags an id the agent already has, however the name is spelled", () => {
    const existing = [{ id: "production_routing", name: "Other" }, "plain string"];
    expect(validateSkillDraft({ ...draft, name: "PRODUCTION  routing" }, existing).name).toBe(
      "duplicateId",
    );
  });

  it("applies the API limits and rejects markup", () => {
    expect(validateSkillDraft({ ...draft, name: "x".repeat(256) }, []).name).toBe("nameTooLong");
    expect(validateSkillDraft({ ...draft, name: "<b>x</b>" }, []).name).toBe("nameMarkup");
    expect(validateSkillDraft({ ...draft, name: "???" }, []).name).toBe("nameNoId");
    expect(validateSkillDraft({ ...draft, description: "x".repeat(8193) }, []).description).toBe(
      "descriptionTooLong",
    );
    expect(validateSkillDraft({ ...draft, tags: ["<i>"] }, []).tags).toBe("tagMarkup");
    expect(validateSkillDraft({ ...draft, tags: ["x".repeat(256)] }, []).tags).toBe("tagTooLong");
    expect(
      validateSkillDraft({ ...draft, tags: Array.from({ length: 51 }, (_, i) => `t${i}`) }, [])
        .tags,
    ).toBe("tagsTooMany");
    expect(
      validateSkillDraft(
        draft,
        Array.from({ length: 100 }, (_, i) => `s${i}`),
      ).form,
    ).toBe("tooManySkills");
  });
});

describe("buildSkill", () => {
  it("trims, derives the id and leaves out empty examples", () => {
    expect(
      buildSkill({
        name: " Production routing ",
        description: " d ",
        tags: ["a"],
        examples: ["", " "],
      }),
    ).toEqual({
      id: "production_routing",
      name: "Production routing",
      description: "d",
      tags: ["a"],
    });
  });
});
