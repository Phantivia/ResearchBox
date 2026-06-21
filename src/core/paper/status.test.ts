import { describe, expect, it } from "vitest";
import type { PaperIR } from "@/core/ir";
import { resolvePaperEntryStatus, shouldShowPaperStatusBadge } from "./status";

function makeIr(overrides: Partial<PaperIR> = {}): PaperIR {
  return {
    arxivId: "2401.12345",
    version: "v1",
    title: "Test",
    abstract: "Abstract",
    abstractBlocks: [],
    authors: [],
    createdAt: 0,
    modelUsed: "none",
    references: [],
    blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
    ...overrides,
  };
}

describe("resolvePaperEntryStatus", () => {
  it("returns ready for loaded papers without translation", () => {
    expect(resolvePaperEntryStatus(makeIr())).toBe("ready");
  });

  it("returns processing when translation has started but is incomplete", () => {
    expect(
      resolvePaperEntryStatus(
        makeIr({
          modelUsed: "test-model",
          blocks: [
            {
              id: "p1",
              type: "paragraph",
              content: "Hello",
              translation: "你好",
            },
            {
              id: "p2",
              type: "paragraph",
              content: "World",
            },
          ],
        }),
      ),
    ).toBe("processing");
  });

  it("returns done when all translatable blocks are translated", () => {
    expect(
      resolvePaperEntryStatus(
        makeIr({
          modelUsed: "test-model",
          blocks: [
            {
              id: "p1",
              type: "paragraph",
              content: "Hello",
              translation: "你好",
            },
          ],
        }),
      ),
    ).toBe("done");
  });
});

describe("shouldShowPaperStatusBadge", () => {
  it("hides badge for ready papers", () => {
    expect(
      shouldShowPaperStatusBadge({ status: "ready", modelUsed: "none" }, false),
    ).toBe(false);
  });

  it("hides legacy processing papers that never started translation", () => {
    expect(
      shouldShowPaperStatusBadge({ status: "processing", modelUsed: "none" }, false),
    ).toBe(false);
  });

  it("shows badge while translation is running", () => {
    expect(
      shouldShowPaperStatusBadge({ status: "processing", modelUsed: "none" }, true),
    ).toBe(true);
  });

  it("shows badge for partial or completed translation metadata", () => {
    expect(
      shouldShowPaperStatusBadge(
        { status: "processing", modelUsed: "test-model" },
        false,
      ),
    ).toBe(true);
    expect(
      shouldShowPaperStatusBadge({ status: "done", modelUsed: "test-model" }, false),
    ).toBe(true);
  });
});
