import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import type { PaperIR } from "@/core/ir";
import { db, getPaper } from "@/db";
import { persistTranslationProgress } from "./persistDraft";

const basePaper: PaperIR = {
  arxivId: "2401.12345",
  version: "latest",
  title: "Draft",
  abstract: "Abstract",
  abstractBlocks: [],
  authors: [],
  blocks: [{ id: "p1", type: "paragraph", content: "Body" }],
  references: [],
  createdAt: 1,
  modelUsed: "test",
};

beforeEach(async () => {
  await db.papers.clear();
});

describe("persistTranslationProgress", () => {
  it("saves structure immediately", async () => {
    const draft = await persistTranslationProgress(null, {
      type: "structure",
      ir: basePaper,
    });

    expect(draft?.title).toBe("Draft");
    const stored = await getPaper("2401.12345", "latest");
    expect(stored?.title).toBe("Draft");
  });

  it("updates draft after each completed block translation", async () => {
    let draft = await persistTranslationProgress(null, {
      type: "structure",
      ir: basePaper,
    });

    draft = await persistTranslationProgress(draft, {
      type: "block-translated",
      blockId: "p1",
      translation: "正文",
    });

    const stored = await getPaper("2401.12345", "latest");
    expect(stored?.blocks[0]?.translation).toBe("正文");
  });
});
