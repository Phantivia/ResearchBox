import { describe, expect, it } from "vitest";
import { buildContinueTranslationSystemPrompt, buildTranslationSystemPrompt } from "./prompts";

describe("buildTranslationSystemPrompt", () => {
  it("requires domain terms to include original text in parentheses", () => {
    const prompt = buildTranslationSystemPrompt("zh-CN");

    expect(prompt).toContain("original term in parentheses");
    expect(prompt).toContain("注意力机制（attention mechanism）");
  });

  it("shares terminology rules with continue prompt", () => {
    const fresh = buildTranslationSystemPrompt("en");
    const resume = buildContinueTranslationSystemPrompt("en");

    expect(resume).toContain("original term in parentheses");
    expect(resume).toContain(fresh.split("\n").find((line) => line.includes("original term")) ?? "");
  });
});
