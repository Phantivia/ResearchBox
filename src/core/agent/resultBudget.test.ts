import { describe, it, expect } from "vitest";
import {
  buildLargeToolResultMessage,
  MAX_RESULT_CHARS,
  PREVIEW_CHARS,
} from "./resultBudget";

describe("buildLargeToolResultMessage", () => {
  it("includes size, resultId, fetch hint, and preview", () => {
    const serialized = "x".repeat(5000);
    const message = buildLargeToolResultMessage(serialized, "result-abc");

    expect(message).toContain("<persisted_output>");
    expect(message).toContain("</persisted_output>");
    expect(message).toContain(`(${serialized.length} chars)`);
    expect(message).toContain("resultId: result-abc");
    expect(message).toContain('fetch_result with resultId "result-abc"');
    expect(message).toContain(`Preview (first ${PREVIEW_CHARS}):`);
    expect(message).toContain("x".repeat(PREVIEW_CHARS));
    expect(message).toContain("\n...");
  });

  it("exports budget constants", () => {
    expect(MAX_RESULT_CHARS).toBe(30_000);
    expect(PREVIEW_CHARS).toBe(2_000);
  });
});
