import type { LLMProvider } from "@/core/llm";
import { textFromChatStreamChunk, type ChatStreamChunk } from "@/core/llm/types";
import {
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  type PromptBlock,
} from "@/core/transformer/prompts";
import {
  extractStreamingTranslationUpdates,
  type StreamingTranslationState,
} from "@/core/transformer/parseResponse";

export type TranslationLatencyMetrics = {
  inputUserChars: number;
  inputSystemChars: number;
  estimatedInputTokens: number;
  timeToResponseMs: number | null;
  ttftContentMs: number | null;
  ttftTranslationMs: number | null;
  totalMs: number;
  firstContentPreview: string;
  firstTranslationPreview: string;
};

export type MeasureTranslationLatencyOpts = {
  targetLang?: string;
  blocks?: PromptBlock[];
  /** Approximate user-message character budget for a representative full abstract. */
  targetInputChars?: number;
};

export const DEFAULT_ABSTRACT_LATENCY_SAMPLE_CHARS = 3000;

const SAMPLE_PARAGRAPH =
  "We study the scaling behavior of transformer language models on scientific document translation. " +
  "Our method preserves inline markup such as <cite data-ref=\"r1\">Smith et al.</cite> while translating " +
  "only human-readable text. Experiments on arXiv abstracts show that batching blocks up to a fixed character " +
  "budget reduces API round-trips without hurting BLEU. We further analyze time-to-first-token under JSON " +
  "response constraints and streaming parsers that extract partial translations before the batch completes.";

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

export function buildSampleTranslationBlocks(targetChars: number): PromptBlock[] {
  const blocks: PromptBlock[] = [];
  let total = 0;
  let index = 0;

  while (total < targetChars) {
    const remaining = targetChars - total;
    const suffix = ` Block ${index + 1}.`;
    const unit = SAMPLE_PARAGRAPH + suffix;
    const content =
      remaining >= unit.length ? unit : unit.slice(0, Math.max(remaining, 1));

    blocks.push({
      id: `bench-block-${index + 1}`,
      content,
    });

    total += content.length;
    index += 1;
  }

  return blocks;
}

function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<ChatStreamChunk> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  );
}

export async function measureTranslationStreamLatency(
  provider: LLMProvider,
  opts: MeasureTranslationLatencyOpts = {},
  deps?: { fetchFn?: typeof fetch },
): Promise<TranslationLatencyMetrics> {
  const targetInputChars = opts.targetInputChars ?? DEFAULT_ABSTRACT_LATENCY_SAMPLE_CHARS;
  const blocks = opts.blocks ?? buildSampleTranslationBlocks(targetInputChars);
  const targetLang = opts.targetLang ?? "zh";
  const system = buildTranslationSystemPrompt(targetLang);
  const userContent = buildTranslationUserPrompt(blocks);
  const inputChars = system.length + userContent.length;

  let timeToResponseMs: number | null = null;
  const startedAt = performance.now();

  const baseFetch = deps?.fetchFn ?? globalThis.fetch;
  const instrumentedFetch: typeof fetch = async (input, init) => {
    const response = await baseFetch(input, init);
    if (timeToResponseMs === null) {
      timeToResponseMs = performance.now() - startedAt;
    }
    return response;
  };

  let ttftContentMs: number | null = null;
  let ttftTranslationMs: number | null = null;
  let firstContentPreview = "";
  let firstTranslationPreview = "";
  let accumulated = "";

  const streamState: StreamingTranslationState = {
    completedIds: new Set(),
    partialById: new Map(),
  };

  const chatResult = provider.chat(
    {
      system,
      messages: [{ role: "user", content: userContent }],
      stream: true,
      json: true,
    },
    { fetchFn: instrumentedFetch },
  );

  if (isAsyncIterable(chatResult)) {
    for await (const chunk of chatResult) {
      const textChunk = textFromChatStreamChunk(chunk);
      if (ttftContentMs === null && textChunk.length > 0) {
        ttftContentMs = performance.now() - startedAt;
        firstContentPreview = textChunk.slice(0, 80);
      }

      accumulated += textChunk;
      for (const update of extractStreamingTranslationUpdates(accumulated, streamState)) {
        if (ttftTranslationMs === null && update.translation.length > 0) {
          ttftTranslationMs = performance.now() - startedAt;
          firstTranslationPreview = update.translation.slice(0, 80);
        }
      }
    }
  } else {
    const raw = await chatResult;
    ttftContentMs = performance.now() - startedAt;
    firstContentPreview = raw.slice(0, 80);
    accumulated = raw;
    for (const update of extractStreamingTranslationUpdates(raw, streamState)) {
      if (ttftTranslationMs === null && update.translation.length > 0) {
        ttftTranslationMs = performance.now() - startedAt;
        firstTranslationPreview = update.translation.slice(0, 80);
      }
    }
  }

  return {
    inputUserChars: userContent.length,
    inputSystemChars: system.length,
    estimatedInputTokens: estimateTokensFromChars(inputChars),
    timeToResponseMs,
    ttftContentMs,
    ttftTranslationMs,
    totalMs: performance.now() - startedAt,
    firstContentPreview,
    firstTranslationPreview,
  };
}

export function formatTranslationLatencyMetrics(
  label: string,
  metrics: TranslationLatencyMetrics,
): string {
  const lines = [
    `[${label}]`,
    `  user chars: ${metrics.inputUserChars}, system chars: ${metrics.inputSystemChars}`,
    `  estimated input tokens: ~${metrics.estimatedInputTokens}`,
    `  time to HTTP response: ${formatMs(metrics.timeToResponseMs)}`,
    `  TTFT (first model content chunk): ${formatMs(metrics.ttftContentMs)}`,
    `  TTFT (first visible translation text): ${formatMs(metrics.ttftTranslationMs)}`,
    `  total stream time: ${formatMs(metrics.totalMs)}`,
  ];

  if (metrics.firstContentPreview) {
    lines.push(`  first content: ${JSON.stringify(metrics.firstContentPreview)}`);
  }
  if (metrics.firstTranslationPreview) {
    lines.push(
      `  first translation: ${JSON.stringify(metrics.firstTranslationPreview)}`,
    );
  }

  return lines.join("\n");
}

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)} ms`;
}
