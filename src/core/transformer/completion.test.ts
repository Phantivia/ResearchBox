import { describe, it, expect } from "vitest";
import type { PaperIR } from "@/core/ir";
import {
  countCompletedTranslations,
  countCompletedTranslationChars,
  countTranslatableBlocks,
  countTranslatableChars,
  hasCompleteTranslation,
  isPaperTranslationComplete,
  stripTranslationsFromIr,
} from "./completion";
import { TRANSLATION_DEBUG_META_KEY } from "./debugMetrics";

function paper(overrides: Partial<PaperIR> = {}): PaperIR {
  return {
    arxivId: "2401.12345",
    version: "latest",
    title: "Test",
    abstract: "Abstract",
    abstractBlocks: [],
    authors: [],
    blocks: [],
    references: [],
    createdAt: Date.now(),
    modelUsed: "test",
    ...overrides,
  };
}

describe("hasCompleteTranslation", () => {
  it("requires non-empty translation without translationMissing", () => {
    expect(
      hasCompleteTranslation({
        id: "p1",
        type: "paragraph",
        content: "Hello",
        translation: "你好",
      }),
    ).toBe(true);
    expect(
      hasCompleteTranslation({
        id: "p2",
        type: "paragraph",
        content: "Hello",
        translation: "",
      }),
    ).toBe(false);
    expect(
      hasCompleteTranslation({
        id: "p3",
        type: "paragraph",
        content: "Hello",
        translation: "你好",
        meta: { translationMissing: true },
      }),
    ).toBe(false);
  });
});

describe("isPaperTranslationComplete", () => {
  it("returns true when all translatable blocks are translated", () => {
    expect(
      isPaperTranslationComplete(
        paper({
          blocks: [
            { id: "p1", type: "paragraph", content: "A", translation: "甲" },
            { id: "m1", type: "math", content: "x" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns false when a translatable block lacks translation", () => {
    expect(
      isPaperTranslationComplete(
        paper({
          blocks: [
            { id: "p1", type: "paragraph", content: "A", translation: "甲" },
            { id: "p2", type: "paragraph", content: "B" },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("countTranslatableBlocks", () => {
  it("counts only translatable blocks", () => {
    expect(
      countTranslatableBlocks(
        paper({
          abstractBlocks: [{ id: "a1", type: "paragraph", content: "Abs" }],
          blocks: [
            { id: "p1", type: "paragraph", content: "A" },
            { id: "m1", type: "math", content: "x" },
          ],
        }),
      ),
    ).toBe(2);
  });
});

describe("countCompletedTranslations", () => {
  it("counts blocks with complete translations", () => {
    expect(
      countCompletedTranslations(
        paper({
          blocks: [
            { id: "p1", type: "paragraph", content: "A", translation: "甲" },
            { id: "p2", type: "paragraph", content: "B" },
            { id: "m1", type: "math", content: "x", translation: "ignored" },
          ],
        }),
      ),
    ).toBe(1);
  });
});

describe("countTranslatableChars", () => {
  it("sums translatable block content lengths", () => {
    expect(
      countTranslatableChars(
        paper({
          abstractBlocks: [{ id: "a1", type: "paragraph", content: "Abs" }],
          blocks: [
            { id: "p1", type: "paragraph", content: "AB" },
            { id: "m1", type: "math", content: "x" },
          ],
        }),
      ),
    ).toBe(5);
  });
});

describe("countCompletedTranslationChars", () => {
  it("sums content length only for completed translations", () => {
    expect(
      countCompletedTranslationChars(
        paper({
          blocks: [
            { id: "p1", type: "paragraph", content: "ABCD", translation: "甲乙" },
            { id: "p2", type: "paragraph", content: "EF" },
          ],
        }),
      ),
    ).toBe(4);
  });
});

describe("stripTranslationsFromIr", () => {
  it("removes translations and translation-related meta", () => {
    const stripped = stripTranslationsFromIr(
      paper({
        blocks: [
          {
            id: "p1",
            type: "paragraph",
            content: "A",
            translation: "甲",
            meta: {
              translationMissing: true,
              [TRANSLATION_DEBUG_META_KEY]: { blockId: "p1" },
              custom: "keep",
            },
          },
        ],
      }),
    );

    expect(stripped.blocks[0]?.translation).toBeUndefined();
    expect(stripped.blocks[0]?.meta).toEqual({ custom: "keep" });
  });
});
