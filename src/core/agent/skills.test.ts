import { describe, it, expect } from "vitest";
import { skills, listSkillMenu } from "./skills";

describe("listSkillMenu", () => {
  it("returns name and description for each skill", () => {
    const menu = listSkillMenu();

    expect(menu).toHaveLength(3);
    expect(menu.map((s) => s.name)).toEqual([
      "lit-review",
      "compare-table",
      "outline",
    ]);
    for (const item of menu) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});

describe("ResearchSkill.load", () => {
  it("loads non-empty template content for each skill", async () => {
    for (const skill of skills) {
      const content = await skill.load();
      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
    }
  });
});
