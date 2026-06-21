import { describe, it, expect } from "vitest";
import { BlockSchema, ReferenceSchema, PaperIRSchema } from "./schema";

/** 最小合法 PaperIR — 只含一个 paragraph block，无可选字段 */
function minimalValidPaperIR() {
  return {
    arxivId: "2401.12345",
    version: "v1",
    title: "Test Paper",
    abstract: "An abstract.",
    abstractBlocks: [],
    authors: ["Alice"],
    blocks: [
      { id: "blk-1", type: "paragraph" as const, content: "Hello world." },
    ],
    references: [{ id: "ref-1", label: "[1]", text: "Some reference." }],
    createdAt: Date.now(),
    modelUsed: "gpt-4o",
  };
}

describe("PaperIRSchema", () => {
  it("accepts a minimal valid PaperIR", () => {
    const result = PaperIRSchema.safeParse(minimalValidPaperIR());
    expect(result.success).toBe(true);
  });

  it("accepts PaperIR with all optional fields populated", () => {
    const full = {
      ...minimalValidPaperIR(),
      blocks: [
        {
          id: "blk-1",
          type: "heading" as const,
          level: 2,
          content: "<h2>Introduction</h2>",
          translation: "介绍",
          math: { tex: "E=mc^2", display: false },
          meta: { summary: "Intro section", keyTerms: ["physics"] },
        },
      ],
    };
    const result = PaperIRSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("rejects when blocks is missing", () => {
    const { blocks: _, ...noBlocks } = minimalValidPaperIR();
    void _;
    const result = PaperIRSchema.safeParse(noBlocks);
    expect(result.success).toBe(false);
  });

  it("rejects when a required top-level field is missing (title)", () => {
    const { title: _, ...noTitle } = minimalValidPaperIR();
    void _;
    const result = PaperIRSchema.safeParse(noTitle);
    expect(result.success).toBe(false);
  });
});

describe("BlockSchema", () => {
  it("rejects an invalid block type", () => {
    const result = BlockSchema.safeParse({
      id: "blk-x",
      type: "unknown_type",
      content: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when id is missing", () => {
    const result = BlockSchema.safeParse({
      type: "paragraph",
      content: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when content is missing", () => {
    const result = BlockSchema.safeParse({
      id: "blk-1",
      type: "paragraph",
    });
    expect(result.success).toBe(false);
  });

  it("accepts block without optional fields (translation, meta, level)", () => {
    const result = BlockSchema.safeParse({
      id: "blk-1",
      type: "paragraph",
      content: "Just text.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects math block with incomplete math field (missing display)", () => {
    const result = BlockSchema.safeParse({
      id: "blk-m",
      type: "math",
      content: "$x^2$",
      math: { tex: "x^2" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects math block with incomplete math field (missing tex)", () => {
    const result = BlockSchema.safeParse({
      id: "blk-m",
      type: "math",
      content: "$x^2$",
      math: { display: true },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid block types", () => {
    const types = [
      "heading",
      "paragraph",
      "math",
      "figure",
      "table",
      "list",
      "codeblock",
      "reference",
    ] as const;

    for (const t of types) {
      const result = BlockSchema.safeParse({
        id: `blk-${t}`,
        type: t,
        content: "c",
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("ReferenceSchema", () => {
  it("accepts a valid reference", () => {
    const result = ReferenceSchema.safeParse({
      id: "ref-1",
      label: "[1]",
      text: "Author et al., 2024",
    });
    expect(result.success).toBe(true);
  });

  it("rejects reference with missing label", () => {
    const result = ReferenceSchema.safeParse({
      id: "ref-1",
      text: "Author et al., 2024",
    });
    expect(result.success).toBe(false);
  });
});
