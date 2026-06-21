import { describe, it, expect } from "vitest";
import type { CleanBlock } from "@/core/cleaner";
import {
  chunkAbstractBlocksForTranslation,
  chunkBlocksForTranslation,
  chunkPaperBlocksForTranslation,
  DEFAULT_MAX_CHUNK_CHARS,
  isTranslatableBlock,
  splitContentAtNaturalBreaks,
} from "./chunk";

function block(
  id: string,
  type: CleanBlock["type"],
  content: string,
): CleanBlock {
  return { id, type, content };
}

describe("isTranslatableBlock", () => {
  it("skips math and codeblock", () => {
    expect(isTranslatableBlock(block("m1", "math", "x^2"))).toBe(false);
    expect(isTranslatableBlock(block("c1", "codeblock", "code"))).toBe(false);
    expect(isTranslatableBlock(block("p1", "paragraph", "text"))).toBe(true);
  });

  it("treats a figure as translatable only when it has a caption", () => {
    const withCaption: CleanBlock = {
      id: "f1",
      type: "figure",
      content: "<figure><img /></figure>",
      caption: "Figure 1: A diagram.",
    };
    const withoutCaption: CleanBlock = {
      id: "f2",
      type: "figure",
      content: "<figure><img /></figure>",
    };

    expect(isTranslatableBlock(withCaption)).toBe(true);
    expect(isTranslatableBlock(withoutCaption)).toBe(false);
  });

  it("chunks figure captions, not the figure HTML", () => {
    const figure: CleanBlock = {
      id: "f1",
      type: "figure",
      content: "<figure><img src='x1.png' /></figure>",
      caption: "Figure 1: A diagram.",
    };

    const chunks = chunkBlocksForTranslation([figure]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.units).toEqual([
      {
        blockId: "f1",
        content: "Figure 1: A diagram.",
        partIndex: 0,
        partCount: 1,
      },
    ]);
  });
});

describe("splitContentAtNaturalBreaks", () => {
  it("splits long text at sentence boundaries", () => {
    const sentence = "First sentence. ";
    const content = sentence.repeat(300);

    const parts = splitContentAtNaturalBreaks(content, 4000);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 4000)).toBe(true);
    expect(parts.join("")).toBe(content);
  });
});

describe("chunkBlocksForTranslation", () => {
  it("keeps every translatable block and preserves order", () => {
    const blocks: CleanBlock[] = [
      block("h1", "heading", "Intro"),
      block("p1", "paragraph", "A".repeat(100)),
      block("m1", "math", "E=mc^2"),
      block("p2", "paragraph", "B".repeat(100)),
      block("c1", "codeblock", "print(1)"),
      block("p3", "paragraph", "C".repeat(100)),
    ];

    const chunks = chunkBlocksForTranslation(blocks, 250);

    const ids = chunks.flatMap((c) => c.units.map((unit) => unit.blockId));
    expect(ids).toEqual(["h1", "p1", "p2", "p3"]);
    expect(chunks.every((c) => c.charCount <= 250)).toBe(true);
  });

  it("splits at heading boundaries when batch is non-empty", () => {
    const blocks: CleanBlock[] = [
      block("p1", "paragraph", "first section body"),
      block("h2", "heading", "Methods"),
      block("p2", "paragraph", "methods body"),
    ];

    const chunks = chunkBlocksForTranslation(blocks, DEFAULT_MAX_CHUNK_CHARS);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.units.map((unit) => unit.blockId)).toEqual(["p1"]);
    expect(chunks[1]!.units.map((unit) => unit.blockId)).toEqual(["h2", "p2"]);
  });

  it("keeps consecutive section/subsection headings with the following body", () => {
    const blocks: CleanBlock[] = [
      block("h1", "heading", "3 Methods"),
      block("h2", "heading", "3.1 Setup"),
      block("p1", "paragraph", "setup body"),
    ];

    const chunks = chunkBlocksForTranslation(blocks, DEFAULT_MAX_CHUNK_CHARS);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.units.map((unit) => unit.blockId)).toEqual([
      "h1",
      "h2",
      "p1",
    ]);
  });

  it("never emits a chunk that is only headings", () => {
    const blocks: CleanBlock[] = [
      block("h1", "heading", "1 Intro"),
      block("p1", "paragraph", "intro body"),
      block("h2", "heading", "2 Method"),
      block("h3", "heading", "2.1 Detail"),
      block("p2", "paragraph", "method body"),
      block("h4", "heading", "Appendix"),
    ];

    const chunks = chunkBlocksForTranslation(blocks, DEFAULT_MAX_CHUNK_CHARS);

    const headingIds = new Set(["h1", "h2", "h3", "h4"]);
    for (const chunk of chunks) {
      const ids = chunk.units.map((unit) => unit.blockId);
      expect(ids.every((id) => headingIds.has(id))).toBe(false);
    }
    // 尾随的孤立标题并入上一批，而非独立成批。
    expect(chunks.flatMap((c) => c.units.map((u) => u.blockId))).toEqual([
      "h1",
      "p1",
      "h2",
      "h3",
      "p2",
      "h4",
    ]);
  });

  it("respects max character limit per batch", () => {
    const blocks: CleanBlock[] = [
      block("p1", "paragraph", "x".repeat(3000)),
      block("p2", "paragraph", "y".repeat(3000)),
      block("p3", "paragraph", "z".repeat(3000)),
    ];

    const chunks = chunkBlocksForTranslation(blocks, 4000);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.charCount <= 4000)).toBe(true);
    expect(chunks.flatMap((c) => c.units.map((unit) => unit.blockId))).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("attaches up to two preceding blocks as context", () => {
    const blocks: CleanBlock[] = [
      block("p1", "paragraph", "First paragraph."),
      block("p2", "paragraph", "Second paragraph."),
      block("p3", "paragraph", "Third paragraph."),
      block("p4", "paragraph", "Fourth paragraph."),
    ];

    const chunks = chunkBlocksForTranslation(blocks, 40);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.contextBlocks.map((item) => item.id)).toEqual(["p1", "p2"]);
  });

  it("keeps the whole abstract in one batch without a character cap", () => {
    const abstractBlocks: CleanBlock[] = [
      block("abs-1", "paragraph", "a".repeat(DEFAULT_MAX_CHUNK_CHARS)),
      block("abs-2", "paragraph", "abstract tail"),
      block("abs-math", "math", "x^2"),
    ];

    const chunks = chunkAbstractBlocksForTranslation(abstractBlocks);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.units.map((unit) => unit.blockId)).toEqual(["abs-1", "abs-2"]);
    expect(chunks[0]?.charCount).toBe(DEFAULT_MAX_CHUNK_CHARS + "abstract tail".length);
    expect(chunks[0]?.contextBlocks).toEqual([]);
  });

  it("prioritizes the abstract batch before body batches", () => {
    const abstractBlocks: CleanBlock[] = [
      block("abs-1", "paragraph", "a".repeat(DEFAULT_MAX_CHUNK_CHARS)),
      block("abs-2", "paragraph", "abstract tail"),
    ];
    const bodyBlocks: CleanBlock[] = [
      block("h1", "heading", "Intro"),
      block("p1", "paragraph", "body"),
    ];

    const chunks = chunkPaperBlocksForTranslation(abstractBlocks, bodyBlocks);

    expect(chunks[0]?.units.map((unit) => unit.blockId)).toEqual(["abs-1", "abs-2"]);
    expect(chunks[1]?.units.map((unit) => unit.blockId)).toEqual(["h1", "p1"]);
    expect(chunks[1]?.contextBlocks.map((item) => item.id)).toEqual([
      "abs-1",
      "abs-2",
    ]);
  });
});
