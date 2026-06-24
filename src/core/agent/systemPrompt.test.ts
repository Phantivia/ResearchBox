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
  });

  it("places retrieval posture and saturation guidance in the dynamic segment after the boundary", () => {
    const prompt = buildAgentSystemPrompt({});
    const boundaryIndex = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);

    const exploreIndex = prompt.indexOf("Explore (探索式)");
    const exhaustiveIndex = prompt.indexOf("Exhaustive (穷尽式)");
    const saturationIndex = prompt.indexOf("approaching saturation");

    expect(exploreIndex).toBeGreaterThan(-1);
    expect(exhaustiveIndex).toBeGreaterThan(-1);
    expect(saturationIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBeGreaterThan(boundaryIndex);
    expect(exhaustiveIndex).toBeGreaterThan(boundaryIndex);
    expect(saturationIndex).toBeGreaterThan(boundaryIndex);
    expect(prompt).toMatch(/default when uncertain/i);
    expect(prompt).toMatch(/retrieval strategy/i);
  });

  it("keeps the abstract in-box principle and citation rules in the stable segment", () => {
    const prompt = buildAgentSystemPrompt({});
    const boundaryIndex = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);

    const inBoxIndex = prompt.indexOf("In-box priority (盒内优先)");
    const citationRulesIndex = prompt.indexOf("Citation rules (引用规范)");

    expect(inBoxIndex).toBeGreaterThan(-1);
    expect(citationRulesIndex).toBeGreaterThan(-1);
    expect(inBoxIndex).toBeLessThan(boundaryIndex);
    expect(citationRulesIndex).toBeLessThan(boundaryIndex);
    expect(prompt).toContain("primary source of truth");
    expect(prompt).toMatch(/Every claim about paper content MUST include a `paperId#blockId` citation/);
  });

  it("places the concrete in-box rule only in the dynamic segment when the box is closed", () => {
    const closedPrompt = buildAgentSystemPrompt({ boxOpen: false });
    const openPrompt = buildAgentSystemPrompt({ boxOpen: true });
    const boundaryIndex = closedPrompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);

    const coreRuleIndex = closedPrompt.indexOf("绝对优先使用盒内论文内容");
    expect(coreRuleIndex).toBeGreaterThan(boundaryIndex);
    expect(closedPrompt).toContain("此点来自盒外、尚未正式纳入盒子");
    expect(openPrompt).not.toContain("绝对优先使用盒内论文内容");
  });

  it("reflects collection phase when boxOpen is true or omitted", () => {
    const openPrompt = buildAgentSystemPrompt({ boxOpen: true });
    const defaultPrompt = buildAgentSystemPrompt({});

    expect(openPrompt).toContain("采集阶段");
    expect(openPrompt).toContain("academic_search / websearch");
    expect(openPrompt).toContain("recommend_papers");
    expect(defaultPrompt).toContain("采集阶段");
    expect(defaultPrompt).not.toContain("研究阶段 — 优先盒内");
  });

  it("reflects research phase when boxOpen is false", () => {
    const closedPrompt = buildAgentSystemPrompt({ boxOpen: false });

    expect(closedPrompt).toContain("研究阶段 — 优先盒内、不主动外搜");
    expect(closedPrompt).not.toContain("采集阶段");
  });
});
