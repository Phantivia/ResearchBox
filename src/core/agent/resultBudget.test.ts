import { describe, it, expect } from "vitest";
import { estimateTokensFromString } from "./contextSize";
import {
  buildLargeToolResultMessage,
  MAX_RESULT_TOKENS,
  PREVIEW_CHARS,
  shouldPersistToolResult,
} from "./resultBudget";

describe("shouldPersistToolResult", () => {
  it("does not persist below the token threshold", () => {
    const below = "x".repeat(MAX_RESULT_TOKENS * 4 - 4);
    expect(estimateTokensFromString(below)).toBe(MAX_RESULT_TOKENS - 1);
    expect(shouldPersistToolResult(below)).toBe(false);
  });

  it("persists at or above the token threshold", () => {
    const atThreshold = "x".repeat(MAX_RESULT_TOKENS * 4);
    expect(estimateTokensFromString(atThreshold)).toBe(MAX_RESULT_TOKENS);
    expect(shouldPersistToolResult(atThreshold)).toBe(true);

    const above = "x".repeat(MAX_RESULT_TOKENS * 4 + 4);
    expect(shouldPersistToolResult(above)).toBe(true);
  });
});

describe("buildLargeToolResultMessage", () => {
  it("includes size, resultId, fetch hint, and preview", () => {
    const serialized = "x".repeat(5000);
    const message = buildLargeToolResultMessage(serialized, "result-abc");

    expect(message).toContain("<persisted_output>");
    expect(message).toContain("</persisted_output>");
    expect(message).toContain(
      `(~${estimateTokensFromString(serialized)} estimated tokens)`,
    );
    expect(message).toContain("resultId: result-abc");
    expect(message).toContain('fetch_result with resultId "result-abc"');
    expect(message).toContain(`Preview (first ${PREVIEW_CHARS} chars):`);
    expect(message).toContain("x".repeat(PREVIEW_CHARS));
    expect(message).toContain("\n...");
  });

  it("exports budget constants", () => {
    expect(MAX_RESULT_TOKENS).toBe(100_000);
    expect(PREVIEW_CHARS).toBe(2_000);
  });
});
