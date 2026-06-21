import { describe, expect, it } from "vitest";
import type { Block } from "@/core/ir";
import { groupPaperBlocks } from "./flowBlocks";

function paragraph(id: string, content: string): Block {
  return { id, type: "paragraph", content };
}

function inlineMath(id: string, tex: string): Block {
  return { id, type: "math", content: "", math: { tex, display: false } };
}

function displayMath(id: string, tex: string): Block {
  return { id, type: "math", content: "", math: { tex, display: true } };
}

describe("groupPaperBlocks", () => {
  it("groups consecutive paragraph and inline math", () => {
    const blocks = [
      paragraph("p1", "We define "),
      inlineMath("m1", "x^2"),
      paragraph("p2", " as the input."),
      displayMath("m2", String.raw`\begin{align} a &= b \end{align}`),
    ];

    const units = groupPaperBlocks(blocks);

    expect(units).toEqual([
      { kind: "flow", blocks: [blocks[0], blocks[1], blocks[2]] },
      { kind: "single", block: blocks[3] },
    ]);
  });

  it("keeps short display math in a flow group", () => {
    const blocks = [paragraph("p1", "Energy "), displayMath("m1", "E=mc^2"), paragraph("p2", " is conserved.")];

    const units = groupPaperBlocks(blocks);

    expect(units).toEqual([{ kind: "flow", blocks }]);
  });

  it("groups blocks in translation and bilingual modes too", () => {
    const blocks = [paragraph("p1", "We define "), inlineMath("m1", "x^2")];

    expect(groupPaperBlocks(blocks)).toEqual([{ kind: "flow", blocks }]);
  });
});
