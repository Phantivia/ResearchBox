import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MathBlock } from "./MathBlock";

describe("MathBlock", () => {
  it("renders valid TeX with KaTeX output", () => {
    const { container } = render(<MathBlock tex="E=mc^2" display={false} />);

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector(".katex-mathml")).toBeNull();
  });

  it("falls back to source TeX when KaTeX throws", () => {
    const invalidTex = String.raw`\label{eq:1}`;

    expect(() => {
      render(<MathBlock tex={invalidTex} display={false} />);
    }).not.toThrow();

    const fallback = screen.getByText(invalidTex);
    expect(fallback).toHaveClass("math-fallback");
    expect(fallback.closest(".katex")).toBeNull();
  });
});
