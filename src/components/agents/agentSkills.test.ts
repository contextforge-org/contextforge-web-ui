import { describe, it, expect } from "vitest";
import { getAgentSkillNames } from "./agentSkills";

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

  it("uses the id when a skill has no name, and accepts plain strings", () => {
    expect(getAgentSkillNames({ skills: [{ id: "echo" }, "Route"] })).toEqual(["echo", "Route"]);
  });

  it("drops blank names and entries it cannot read", () => {
    expect(
      getAgentSkillNames({ skills: [{ name: "  " }, null, 42, {}, { name: " Echo " }] }),
    ).toEqual(["Echo"]);
  });

  it.each([
    ["nothing", {}],
    ["a null capabilities", { capabilities: null }],
    ["a non-array skills value", { skills: "echo", capabilities: { skills: "echo" } }],
    ["empty lists", { skills: [], capabilities: { skills: [] } }],
  ])("returns no skills for %s", (_name, agent) => {
    expect(getAgentSkillNames(agent)).toEqual([]);
  });
});
