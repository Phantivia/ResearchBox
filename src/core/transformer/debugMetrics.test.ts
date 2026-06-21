import { describe, expect, it } from "vitest";
import type { Block } from "@/core/ir";
import {
  estimateTokensFromChars,
  getTranslationDebugMetrics,
  withTranslationDebugMetrics,
  type TranslationDebugMetrics,
} from "./debugMetrics";

const METRICS: TranslationDebugMetrics = {
  providerId: "mock",
  modelLabel: "test-model",
  targetLang: "zh",
  batchIndex: 0,
  blockId: "p1",
  inputChars: 100,
  outputChars: 20,
  estimatedInputTokens: 25,
  estimatedOutputTokens: 5,
  estimatedTotalTokens: 30,
  batchInputTokens: 60,
  firstTokenLatencyMs: 42,
  firstTranslationLatencyMs: 50,
  totalLatencyMs: 200,
  averageTokenSpeed: 25,
  streamed: true,
  attempt: 1,
};

describe("estimateTokensFromChars", () => {
  it("uses a conservative 4 characters per token estimate", () => {
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(8)).toBe(2);
    expect(estimateTokensFromChars(9)).toBe(3);
  });
});

describe("translation debug meta helpers", () => {
  it("stores and reads translation debug metrics from block meta", () => {
    const block: Block = {
      id: "p1",
      type: "paragraph",
      content: "Original.",
    };

    const next = withTranslationDebugMetrics(block, METRICS);

    expect(getTranslationDebugMetrics(next)).toEqual(METRICS);
    expect(getTranslationDebugMetrics(block)).toBeUndefined();
  });
});
