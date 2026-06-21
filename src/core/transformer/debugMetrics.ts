import type { Block } from "@/core/ir";

export const TRANSLATION_DEBUG_META_KEY = "translationDebug";

export type TranslationDebugMetrics = {
  providerId: string;
  modelLabel: string;
  targetLang: string;
  batchIndex: number;
  blockId: string;
  inputChars: number;
  outputChars: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  batchInputTokens: number;
  firstTokenLatencyMs: number | null;
  firstTranslationLatencyMs: number | null;
  totalLatencyMs: number;
  averageTokenSpeed: number | null;
  streamed: boolean;
  attempt: number;
};

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

export function withTranslationDebugMetrics(
  block: Block,
  metrics: TranslationDebugMetrics,
): Block {
  return {
    ...block,
    meta: {
      ...block.meta,
      [TRANSLATION_DEBUG_META_KEY]: metrics,
    },
  };
}

export function getTranslationDebugMetrics(
  block: Block,
): TranslationDebugMetrics | undefined {
  const value = block.meta?.[TRANSLATION_DEBUG_META_KEY];
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<TranslationDebugMetrics>;
  if (
    typeof candidate.blockId !== "string" ||
    typeof candidate.modelLabel !== "string" ||
    typeof candidate.estimatedTotalTokens !== "number" ||
    typeof candidate.totalLatencyMs !== "number"
  ) {
    return undefined;
  }

  return candidate as TranslationDebugMetrics;
}
