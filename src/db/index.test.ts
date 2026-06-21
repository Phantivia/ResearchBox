import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db, savePaper, getPaper, clearAllTranslationCache } from "./index";
import type { PaperIR } from "@/core/ir";

function makePaper(overrides: Partial<PaperIR> = {}): PaperIR {
  return {
    arxivId: "2401.12345",
    version: "v1",
    title: "Test Paper",
    authors: ["Alice", "Bob"],
    abstract: "An abstract.",
    abstractBlocks: [],
    blocks: [
      {
        id: "blk-1",
        type: "paragraph",
        content: "Hello world.",
      },
    ],
    references: [
      { id: "ref-1", label: "[1]", text: "Some reference." },
    ],
    createdAt: Date.now(),
    modelUsed: "test-model",
    ...overrides,
  };
}

beforeEach(async () => {
  await db.papers.clear();
});

describe("savePaper", () => {
  it("persists a PaperIR to the papers table", async () => {
    const paper = makePaper();
    await savePaper(paper);

    const count = await db.papers.count();
    expect(count).toBe(1);
  });

  it("upserts when saving the same arxivId+version again", async () => {
    const paper = makePaper();
    await savePaper(paper);
    await savePaper({ ...paper, title: "Updated Title" });

    const count = await db.papers.count();
    expect(count).toBe(1);

    const stored = await db.papers.get([paper.arxivId, paper.version]);
    expect(stored?.title).toBe("Updated Title");
  });

  it("stores different versions as separate rows", async () => {
    await savePaper(makePaper({ version: "v1" }));
    await savePaper(makePaper({ version: "v2" }));

    const count = await db.papers.count();
    expect(count).toBe(2);
  });
});

describe("getPaper", () => {
  it("returns undefined for a non-existent paper", async () => {
    const result = await getPaper("0000.00000", "v1");
    expect(result).toBeUndefined();
  });

  it("retrieves a previously saved paper by arxivId + version", async () => {
    const paper = makePaper({ arxivId: "2312.99999", version: "v3" });
    await savePaper(paper);

    const result = await getPaper("2312.99999", "v3");
    expect(result).toBeDefined();
    expect(result!.arxivId).toBe("2312.99999");
    expect(result!.version).toBe("v3");
    expect(result!.title).toBe("Test Paper");
  });

  it("does not return a paper with matching arxivId but different version", async () => {
    await savePaper(makePaper({ arxivId: "2401.12345", version: "v1" }));

    const result = await getPaper("2401.12345", "v2");
    expect(result).toBeUndefined();
  });
});

describe("clearAllTranslationCache", () => {
  it("removes translations from all cached papers", async () => {
    await savePaper(
      makePaper({
        blocks: [
          {
            id: "blk-1",
            type: "paragraph",
            content: "Hello world.",
            translation: "你好世界。",
          },
        ],
      }),
    );
    await savePaper(
      makePaper({
        arxivId: "2401.99999",
        blocks: [{ id: "blk-2", type: "paragraph", content: "No translation." }],
      }),
    );

    const count = await clearAllTranslationCache();
    expect(count).toBe(1);

    const stored = await getPaper("2401.12345", "v1");
    expect(stored?.blocks[0]?.translation).toBeUndefined();
  });
});
