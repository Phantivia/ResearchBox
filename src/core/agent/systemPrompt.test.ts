import { describe, it, expect } from "vitest";
import {
  buildAgentSystemPrompt,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
} from "./systemPrompt";
import { IN_BOX_PRIORITY_RULE } from "./boundary";

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

  it("includes in-box priority rule and citation rules in the stable segment", () => {
    const prompt = buildAgentSystemPrompt({});
    const boundaryIndex = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);

    const inBoxIndex = prompt.indexOf(IN_BOX_PRIORITY_RULE);
    const citationRulesIndex = prompt.indexOf("Citation rules (引用规范)");

    expect(inBoxIndex).toBeGreaterThan(-1);
    expect(citationRulesIndex).toBeGreaterThan(-1);
    expect(inBoxIndex).toBeLessThan(boundaryIndex);
    expect(citationRulesIndex).toBeLessThan(boundaryIndex);
    expect(prompt).toContain("绝对优先使用盒内论文内容");
    expect(prompt).toContain("此点来自盒外、尚未正式纳入盒子");
    expect(prompt).toMatch(/Every claim about paper content MUST include a `paperId#blockId` citation/);
  });

  it("reflects collection phase when boxOpen is true or omitted", () => {
    const openPrompt = buildAgentSystemPrompt({ boxOpen: true });
    const defaultPrompt = buildAgentSystemPrompt({});

    expect(openPrompt).toContain("采集阶段");
    expect(openPrompt).toContain("academic_search / websearch");
    expect(openPrompt).toContain("逐篇纳入");
    expect(defaultPrompt).toContain("采集阶段");
    expect(defaultPrompt).not.toContain("研究阶段 — 优先盒内");
  });

  it("reflects research phase when boxOpen is false", () => {
    const closedPrompt = buildAgentSystemPrompt({ boxOpen: false });

    expect(closedPrompt).toContain("研究阶段 — 优先盒内、不主动外搜");
    expect(closedPrompt).not.toContain("采集阶段");
  });
});
