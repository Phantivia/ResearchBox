import { describe, expect, it } from "vitest";
import { mathDisplayMode, shouldFlowInlineMath } from "./layout";

describe("shouldFlowInlineMath", () => {
  it("treats inline math as flow content", () => {
    expect(shouldFlowInlineMath("x^2", false)).toBe(true);
  });

  it("flows short display math with text", () => {
    expect(shouldFlowInlineMath("E=mc^2", true)).toBe(true);
    expect(shouldFlowInlineMath("\\alpha + \\beta", true)).toBe(true);
  });

  it("keeps multi-line or environment display math block-level", () => {
    expect(shouldFlowInlineMath(String.raw`\begin{align} a &= b \\ c &= d \end{align}`, true)).toBe(
      false,
    );
    expect(shouldFlowInlineMath(String.raw`x = 1 \\ y = 2`, true)).toBe(false);
  });

  it("keeps long display formulas block-level", () => {
    const longTex = "\\sum_{i=1}^{n} \\frac{x_i - \\mu}{\\sigma} \\cdot w_i";
    expect(shouldFlowInlineMath(longTex, true)).toBe(false);
  });
});

describe("mathDisplayMode", () => {
  it("uses KaTeX inline mode for flow formulas", () => {
    expect(mathDisplayMode("x^2", false)).toBe(false);
    expect(mathDisplayMode("E=mc^2", true)).toBe(false);
  });

  it("uses KaTeX display mode for block formulas", () => {
    expect(mathDisplayMode(String.raw`\begin{equation} E=mc^2 \end{equation}`, true)).toBe(true);
  });
});
