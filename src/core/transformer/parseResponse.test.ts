import { describe, expect, it } from "vitest";
import {
  extractStreamingTranslationUpdates,
  parseTranslationBatchResponse,
  type StreamingTranslationState,
} from "./parseResponse";

function emptyState(): StreamingTranslationState {
  return { completedIds: new Set(), partialById: new Map() };
}

describe("extractStreamingTranslationUpdates", () => {
  it("extracts partial translation while JSON is incomplete", () => {
    const state = emptyState();
    const updates = extractStreamingTranslationUpdates(
      '{"translations":[{"id":"p1","translation":"第一段',
      state,
    );

    expect(updates).toEqual([
      { blockId: "p1", translation: "第一段", complete: false },
    ]);
  });

  it("marks block complete when closing quote arrives", () => {
    const state = emptyState();
    extractStreamingTranslationUpdates(
      '{"translations":[{"id":"p1","translation":"第一段',
      state,
    );

    const updates = extractStreamingTranslationUpdates(
      '{"translations":[{"id":"p1","translation":"第一段。"}',
      state,
    );

    expect(updates).toEqual([
      { blockId: "p1", translation: "第一段。", complete: true },
    ]);
    expect(state.completedIds.has("p1")).toBe(true);
  });

  it("streams multiple blocks in order", () => {
    const state = emptyState();
    const raw =
      '{"translations":[{"id":"p1","translation":"A"},{"id":"p2","translation":"B半';

    const updates = extractStreamingTranslationUpdates(raw, state);

    expect(updates).toEqual([
      { blockId: "p1", translation: "A", complete: true },
      { blockId: "p2", translation: "B半", complete: false },
    ]);
  });

  it("extracts complete objects when fields are reordered or extended", () => {
    const state = emptyState();
    const raw =
      '{"translations":[{"translation":"A","id":"p1","extra":true},{"id":"p2","translation":"B"}]}';

    const updates = extractStreamingTranslationUpdates(raw, state);

    expect(updates).toEqual([
      { blockId: "p1", translation: "A", complete: true },
      { blockId: "p2", translation: "B", complete: true },
    ]);
  });

  it("decodes escaped characters in partial strings", () => {
    const state = emptyState();
    const updates = extractStreamingTranslationUpdates(
      '{"translations":[{"id":"p1","translation":"line1\\nline',
      state,
    );

    expect(updates[0]?.translation).toBe("line1\nline");
  });
});

describe("parseTranslationBatchResponse", () => {
  it("parses valid batch JSON", () => {
    const parsed = parseTranslationBatchResponse(
      JSON.stringify({
        translations: [{ id: "p1", translation: "译文" }],
      }),
    );
    expect(parsed.translations[0]?.translation).toBe("译文");
  });
});
