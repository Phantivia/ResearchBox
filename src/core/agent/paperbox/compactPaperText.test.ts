import { describe, expect, it } from "vitest";
import type { PaperIR } from "@/core/ir";
import { formatCompactPaperText, stripHtmlToText } from "./compactPaperText";

function makePaperIr(overrides: Partial<PaperIR> = {}): PaperIR {
  return {
    arxivId: "2401.12345",
    version: "latest",
    title: "Attention Is All You Need",
    authors: ["Alice"],
    abstract: "<p>We propose transformers.</p>",
    abstractBlocks: [
      {
        id: "abs-1",
        type: "paragraph",
        content: "<p>We propose <strong>transformers</strong>.</p>",
      },
    ],
    blocks: [
      {
        id: "h-1",
        type: "heading",
        level: 1,
        content: "<h1>Introduction</h1>",
      },
      {
        id: "p-1",
        type: "paragraph",
        content: "<p>Sequence modeling is <em>hard</em>.</p>",
      },
    ],
    references: [],
    createdAt: Date.now(),
    modelUsed: "test",
    ...overrides,
  };
}

describe("stripHtmlToText", () => {
  it("removes tags and collapses whitespace per line", () => {
    expect(stripHtmlToText("<p>Hello <strong>world</strong>.</p>")).toBe(
      "Hello world.",
    );
  });

  it("preserves line breaks from block-level closings", () => {
    expect(stripHtmlToText("<p>Line one</p><p>Line two</p>")).toBe(
      "Line one\nLine two",
    );
  });

  it("decodes common HTML entities", () => {
    expect(stripHtmlToText("a&nbsp;&amp;&nbsp;b")).toBe("a & b");
  });
});

describe("formatCompactPaperText", () => {
  it("emits paperId#blockId markers with stripped plain text", () => {
    const text = formatCompactPaperText(makePaperIr(), {
      paperId: "2401.12345:latest",
      routeId: "2401.12345",
    });

    expect(text).toContain("# Attention Is All You Need");
    expect(text).toContain("paperId: 2401.12345:latest");
    expect(text).toContain("routeId: 2401.12345");
    expect(text).toContain("[2401.12345:latest#abs-1] We propose transformers.");
    expect(text).toContain("[2401.12345:latest#h-1] Introduction");
    expect(text).toContain("[2401.12345:latest#p-1] Sequence modeling is hard.");
    expect(text).not.toContain("<p>");
    expect(text).not.toContain("<strong>");
  });

  it("uses TeX for math blocks instead of MathML HTML", () => {
    const text = formatCompactPaperText(
      makePaperIr({
        blocks: [
          {
            id: "m-1",
            type: "math",
            content: "<math><semantics>...</semantics></math>",
            math: { tex: String.raw`\alpha + \beta`, display: true },
          },
        ],
      }),
      { paperId: "2401.12345:latest" },
    );

    expect(text).toContain("[2401.12345:latest#m-1] $$\\alpha + \\beta$$");
    expect(text).not.toContain("<math");
  });

  it("summarizes figures with caption only", () => {
    const text = formatCompactPaperText(
      makePaperIr({
        blocks: [
          {
            id: "f-1",
            type: "figure",
            content: "<figure><img src='x.png' alt='ignored' /></figure>",
            caption: "<figcaption>Figure 1: <em>Overview</em></figcaption>",
          },
        ],
      }),
      { paperId: "2401.12345:latest" },
    );

    expect(text).toContain("[2401.12345:latest#f-1] [figure] Figure 1: Overview");
    expect(text).not.toContain("<img");
  });
});
