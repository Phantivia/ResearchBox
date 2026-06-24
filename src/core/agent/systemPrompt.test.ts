import { describe, it, expect } from "vitest";
import {
  buildAgentSystemPrompt,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
} from "./systemPrompt";

describe("buildAgentSystemPrompt", () => {
  it("places the stable segment before the dynamic boundary and session context", () => {
    const prompt = buildAgentSystemPrompt({
      projectName: "Literature Review",
      date: "2026-06-23",
    });

    const boundaryIndex = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);
    const projectIndex = prompt.indexOf("Literature Review");
    const roleIndex = prompt.indexOf("academic research assistant");

    expect(boundaryIndex).toBeGreaterThan(-1);
    expect(roleIndex).toBeGreaterThan(-1);
    expect(roleIndex).toBeLessThan(boundaryIndex);
    expect(projectIndex).toBeGreaterThan(boundaryIndex);
    expect(prompt).toContain("Today's date: 2026-06-23");
    expect(prompt).toContain("paperId#blockId");
    expect(prompt).toContain("retrieval tool");
  });

  it("includes retrieval posture and saturation guidance in the stable segment before the dynamic boundary", () => {
    const prompt = buildAgentSystemPrompt({});
    const boundaryIndex = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);

    const exploreIndex = prompt.indexOf("Explore (探索式)");
    const exhaustiveIndex = prompt.indexOf("Exhaustive (穷尽式)");
    const saturationIndex = prompt.indexOf("approaching saturation");

    expect(exploreIndex).toBeGreaterThan(-1);
    expect(exhaustiveIndex).toBeGreaterThan(-1);
    expect(saturationIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBeLessThan(boundaryIndex);
    expect(exhaustiveIndex).toBeLessThan(boundaryIndex);
    expect(saturationIndex).toBeLessThan(boundaryIndex);
    expect(prompt).toMatch(/default when uncertain/i);
    expect(prompt).toMatch(/retrieval strategy/i);
  });
});
