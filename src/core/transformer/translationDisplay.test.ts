import { describe, expect, it } from "vitest";
import {
  computeRevealStep,
  countTranslationTextLength,
  sliceTranslationToTextLength,
} from "./translationDisplay";

describe("countTranslationTextLength", () => {
  it("ignores HTML tags", () => {
    expect(countTranslationTextLength("Hello <cite>ref</cite> world")).toBe(15);
  });
});

describe("sliceTranslationToTextLength", () => {
  it("reveals plain text progressively", () => {
    expect(sliceTranslationToTextLength("你好世界", 2)).toBe("你好");
  });

  it("keeps whole tags when their text is included", () => {
    const html = "见 <cite class='ref' data-ref='r1'>[1]</cite> 文";
    expect(sliceTranslationToTextLength(html, 2)).toBe("见 ");
    expect(sliceTranslationToTextLength(html, 3)).toBe(
      "见 <cite class='ref' data-ref='r1'>[",
    );
    expect(sliceTranslationToTextLength(html, 5)).toBe(
      "见 <cite class='ref' data-ref='r1'>[1]",
    );
  });

  it("returns full string when text length exceeds content", () => {
    const html = "短文本";
    expect(sliceTranslationToTextLength(html, 99)).toBe(html);
  });
});

describe("computeRevealStep", () => {
  it("reveals faster when stream is complete", () => {
    expect(computeRevealStep(40, false)).toBe(8);
    expect(computeRevealStep(40, true)).toBe(16);
  });

  it("scales with backlog so large backlogs catch up quickly", () => {
    expect(computeRevealStep(100, false)).toBe(20);
    expect(computeRevealStep(200, true)).toBe(80);
  });

  it("keeps a minimum step and never exceeds backlog", () => {
    expect(computeRevealStep(3, false)).toBe(3);
    expect(computeRevealStep(5, false)).toBe(4);
    expect(computeRevealStep(0, false)).toBe(0);
  });
});
