import { describe, expect, it } from "vitest";
import {
  breakDisplayEquation,
  estimateDisplayMathWidth,
  mathDisplayMode,
  shouldFlowInlineMath,
} from "./layout";

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

describe("estimateDisplayMathWidth", () => {
  it("weights fractions and sums more heavily than plain letters", () => {
    const plain = estimateDisplayMathWidth("a + b + c + d + e");
    const heavy = estimateDisplayMathWidth(String.raw`\frac{a}{b} + \sum_{i=1}^{n} x_i`);
    expect(heavy).toBeGreaterThan(plain);
  });
});

describe("breakDisplayEquation", () => {
  it("leaves short formulas untouched", () => {
    expect(breakDisplayEquation("E = mc^2")).toBe("E = mc^2");
  });

  it("leaves moderately long formulas to DisplayMath scaling", () => {
    const tex = "L(\\theta) = \\alpha + \\beta + \\gamma + \\delta + \\epsilon + \\zeta + \\eta";
    expect(breakDisplayEquation(tex)).toBe(tex);

    const chain = "f(x) = a + b + c + d + e = g + h + i + j + k = m + n + o + p";
    expect(breakDisplayEquation(chain)).toBe(chain);
  });

  it("does not touch formulas that already break or align", () => {
    const aligned = String.raw`\begin{aligned} a &= b \\ c &= d \end{aligned}`;
    expect(breakDisplayEquation(aligned)).toBe(aligned);
    const manual = String.raw`x = 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 \\ y = 9`;
    expect(breakDisplayEquation(manual)).toBe(manual);
  });

  it("aligns a multi-relation chain before each relation", () => {
    const terms = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        String.fromCharCode(97 + (index % 26)),
      ).join(" + ");
    const tex = `f(x) = ${terms(18)} = ${terms(18)} = ${terms(18)}`;
    const out = breakDisplayEquation(tex);
    expect(out).toContain("\\begin{aligned}");
    expect(out).toContain(`f(x) &= ${terms(18)}`);
    expect(out).toContain(`&= ${terms(18)}`);
    expect(out.match(/\\\\/g)).toHaveLength(2);
  });

  it("ignores relations nested inside braces, sub/superscripts", () => {
    const tex = "\\sum_{i=1}^{n} \\frac{x_i - \\mu}{\\sigma} \\cdot w_i \\cdot z_i";
    expect(breakDisplayEquation(tex)).toBe(tex);
  });

  it("splits a single long equation at top-level additive operators", () => {
    const rhs = Array.from({ length: 42 }, (_, index) =>
      String.fromCharCode(97 + (index % 26)),
    ).join(" + ");
    const tex = `L(\\theta) = ${rhs}`;
    const out = breakDisplayEquation(tex);
    expect(out).toContain("\\begin{aligned}");
    expect(out).toContain("L(\\theta) &= a");
    expect(out).toContain("&\\quad + b");
  });

  it("does not split a leading unary sign on the right-hand side", () => {
    const tail = Array.from({ length: 44 }, (_, index) =>
      String.fromCharCode(97 + (index % 26)),
    ).join(" + ");
    const tex = `y = -x + ${tail}`;
    const out = breakDisplayEquation(tex);
    expect(out).toContain("y &= -x");
    expect(out).not.toContain("&\\quad -x");
  });
});
