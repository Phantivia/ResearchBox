import { describe, it, expect } from "vitest";
import type { PaperIR } from "@/core/ir";
import { buildBlockCandidates, formatManifest } from "./manifest";

const CREATED_AT = 1_700_000_000_000;

function makePaper(
  arxivId: string,
  version: string,
  blocks: PaperIR["blocks"],
): PaperIR {
  return {
    arxivId,
    version,
    title: "Test Paper",
    abstract: "Abstract",
    abstractBlocks: [],
    authors: ["Alice"],
    blocks,
    references: [],
    createdAt: CREATED_AT,
    modelUsed: "test-model",
  };
}

describe("buildBlockCandidates", () => {
  it("collects blocks from multiple papers with heading context and previews", () => {
    const papers = [
      makePaper("2401.11111", "v1", [
        { id: "h1", type: "heading", level: 2, content: "<h2>Intro</h2>" },
        {
          id: "p1",
          type: "paragraph",
          content: "<p>First paragraph.</p>",
        },
      ]),
      makePaper("2401.22222", "latest", [
        {
          id: "f1",
          type: "figure",
          content: "<figure><img /></figure>",
          caption: "<p>Model diagram</p>",
        },
      ]),
    ];

    const candidates = buildBlockCandidates(papers);

    expect(candidates).toEqual([
      {
        paperId: "2401.11111:v1",
        blockId: "h1",
        heading: "Intro",
        preview: "Intro",
        fetchedAt: CREATED_AT,
      },
      {
        paperId: "2401.11111:v1",
        blockId: "p1",
        heading: "Intro",
        preview: "First paragraph.",
        fetchedAt: CREATED_AT,
      },
      {
        paperId: "2401.22222:latest",
        blockId: "f1",
        preview: "Model diagram",
        fetchedAt: CREATED_AT,
      },
    ]);
  });

  it("filters by paperIds when provided", () => {
    const papers = [
      makePaper("2401.11111", "v1", [
        { id: "a1", type: "paragraph", content: "Paper A" },
      ]),
      makePaper("2401.22222", "v1", [
        { id: "b1", type: "paragraph", content: "Paper B" },
      ]),
    ];

    const candidates = buildBlockCandidates(papers, {
      paperIds: ["2401.11111:v1"],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      paperId: "2401.11111:v1",
      blockId: "a1",
    });
  });

  it("truncates preview to about 120 plain-text characters", () => {
    const longText = "word ".repeat(40).trim();
    const papers = [
      makePaper("2401.33333", "v1", [
        { id: "long", type: "paragraph", content: `<p>${longText}</p>` },
      ]),
    ];

    const preview = buildBlockCandidates(papers)[0]?.preview;
    expect(preview).toBeDefined();
    expect(preview!.length).toBeLessThanOrEqual(120);
    expect(preview!.endsWith("…")).toBe(true);
  });
});

describe("formatManifest", () => {
  it("formats lines with optional heading", () => {
    const manifest = formatManifest([
      {
        paperId: "2401.11111:v1",
        blockId: "p1",
        heading: "Methods",
        preview: "We train a transformer.",
        fetchedAt: CREATED_AT,
      },
      {
        paperId: "2401.22222:latest",
        blockId: "p2",
        preview: "Baseline results.",
        fetchedAt: CREATED_AT,
      },
    ]);

    expect(manifest).toBe(
      [
        "- 2401.11111:v1#p1 (Methods): We train a transformer.",
        "- 2401.22222:latest#p2: Baseline results.",
      ].join("\n"),
    );
  });
});
