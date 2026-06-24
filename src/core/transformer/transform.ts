import type { CleanResult } from "@/core/cleaner";
import type { LLMProvider } from "@/core/llm";
import { PaperIRSchema, type Block, type PaperIR } from "@/core/ir";
import {
  buildFullTranslationPayload,
  buildResumeTranslationPayload,
  isTranslatableBlock,
  unitPromptId,
  type FullTranslationPayload,
  type ResumeTranslationPayload,
  type TranslationUnit,
} from "./chunk";
import {
  buildContinueRetryUserPrompt,
  buildContinueTranslationSystemPrompt,
  buildContinueTranslationUserPrompt,
  buildRetryUserPrompt,
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  type CompletedBlock,
  type PromptBlock,
} from "./prompts";
import {
  extractStreamingTranslationUpdates,
  parseTranslationBatchResponse,
  type StreamingTranslationState,
} from "./parseResponse";
import {
  estimateTokensFromChars,
  withTranslationDebugMetrics,
  type TranslationDebugMetrics,
} from "./debugMetrics";
import { isPaperTranslationComplete } from "./completion";

export type CleanedResult = CleanResult;

export type TransformProgress =
  | { type: "structure"; ir: PaperIR }
  | {
      type: "block-translated";
      blockId: string;
      translation: string;
      partial?: boolean;
      debugMetrics?: TranslationDebugMetrics;
    }
  | { type: "done"; ir: PaperIR }
  | { type: "degraded"; ir: PaperIR; reason: string };

export type TransformOpts = {
  targetLang: string;
  modelLabel: string;
  arxivId?: string;
  version?: string;
  debugMode?: boolean;
  signal?: AbortSignal;
};

const MAX_RETRIES = 2;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Transform aborted", "AbortError");
  }
}

function cleanedToBlocks(cleaned: CleanResult): Block[] {
  return cleaned.blocks.map((block) => ({ ...block }));
}

function cleanedToAbstractBlocks(cleaned: CleanResult): Block[] {
  return cleaned.abstractBlocks.map((block) => ({ ...block }));
}

function findBlock(ir: PaperIR, blockId: string): Block | undefined {
  return ir.abstractBlocks.find((block) => block.id === blockId) ?? ir.blocks.find((block) => block.id === blockId);
}

function buildBaseIR(cleaned: CleanResult, opts: TransformOpts): PaperIR {
  const ir: PaperIR = {
    arxivId: opts.arxivId ?? "unknown",
    version: opts.version ?? "latest",
    title: cleaned.title,
    abstract: cleaned.abstract,
    abstractBlocks: cleanedToAbstractBlocks(cleaned),
    authors: cleaned.authors,
    blocks: cleanedToBlocks(cleaned),
    references: cleaned.references,
    createdAt: Date.now(),
    modelUsed: opts.modelLabel,
  };
  return PaperIRSchema.parse(ir);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  );
}

function markTranslationMissing(block: Block): Block {
  return {
    ...block,
    meta: { ...block.meta, translationMissing: true },
  };
}

function replaceBlock(ir: PaperIR, blockId: string, next: Block): void {
  const abstractIdx = ir.abstractBlocks.findIndex((block) => block.id === blockId);
  if (abstractIdx >= 0) {
    ir.abstractBlocks[abstractIdx] = next;
    return;
  }

  const bodyIdx = ir.blocks.findIndex((block) => block.id === blockId);
  if (bodyIdx >= 0) {
    ir.blocks[bodyIdx] = next;
  }
}

function applyTranslation(ir: PaperIR, blockId: string, translation: string): void {
  const block = findBlock(ir, blockId);
  if (!block) return;
  block.translation = translation;
  if (block.meta?.translationMissing) {
    const { translationMissing: _, ...rest } = block.meta;
    block.meta = Object.keys(rest).length > 0 ? rest : undefined;
  }
}

function cloneIr(ir: PaperIR): PaperIR {
  return PaperIRSchema.parse(structuredClone(ir));
}

type TranslationStreamUpdate = {
  blockId: string;
  promptId: string;
  partIndex: number;
  partCount: number;
  translation: string;
  complete: boolean;
  debugMetrics?: TranslationDebugMetrics;
};

type DebugBatchContext = {
  enabled: boolean;
  providerId: string;
  modelLabel: string;
  targetLang: string;
};

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function buildDebugMetrics(
  block: Block,
  translation: string,
  context: DebugBatchContext,
  request: {
    attempt: number;
    inputUserChars: number;
    inputSystemChars: number;
    batchInputTokens: number;
    requestStartedAt: number;
    firstContentAt: number | null;
    firstTranslationAt: number | null;
    completedAt: number;
    streamed: boolean;
  },
): TranslationDebugMetrics | undefined {
  if (!context.enabled) {
    return undefined;
  }

  const blockInputChars = request.inputSystemChars + block.content.length;
  const estimatedInputTokens = estimateTokensFromChars(blockInputChars);
  const estimatedOutputTokens = estimateTokensFromChars(translation.length);
  const visibleDurationMs =
    request.firstTranslationAt === null
      ? request.completedAt - request.requestStartedAt
      : request.completedAt - request.firstTranslationAt;
  const speedDurationSeconds = Math.max(
    visibleDurationMs > 0
      ? visibleDurationMs / 1000
      : (request.completedAt - request.requestStartedAt) / 1000,
    0,
  );

  return {
    providerId: context.providerId,
    modelLabel: context.modelLabel,
    targetLang: context.targetLang,
    batchIndex: 0,
    blockId: block.id,
    inputChars: blockInputChars,
    outputChars: translation.length,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
    batchInputTokens: request.batchInputTokens,
    firstTokenLatencyMs:
      request.firstContentAt === null
        ? null
        : request.firstContentAt - request.requestStartedAt,
    firstTranslationLatencyMs:
      request.firstTranslationAt === null
        ? null
        : request.firstTranslationAt - request.requestStartedAt,
    totalLatencyMs: request.completedAt - request.requestStartedAt,
    averageTokenSpeed:
      speedDurationSeconds > 0 ? estimatedOutputTokens / speedDurationSeconds : null,
    streamed: request.streamed,
    attempt: request.attempt,
  };
}

function recordFirstTranslationAt(
  timesByBlockId: Map<string, number>,
  update: { blockId: string; translation: string },
): number | null {
  const current = timesByBlockId.get(update.blockId);
  if (current !== undefined) {
    return current;
  }

  if (update.translation.length === 0) {
    return null;
  }

  const observedAt = nowMs();
  timesByBlockId.set(update.blockId, observedAt);
  return observedAt;
}

function unitToDebugBlock(unit: TranslationUnit): Block {
  return {
    id: unit.blockId,
    type: "paragraph",
    content: unit.content,
  };
}

function mapPromptTranslationUpdate(
  update: { blockId: string; translation: string; complete: boolean },
  unitByPromptId: Map<string, TranslationUnit>,
  debugContext: DebugBatchContext,
  request: {
    attempt: number;
    inputUserChars: number;
    inputSystemChars: number;
    batchInputTokens: number;
    requestStartedAt: number;
    firstContentAt: number | null;
    firstTranslationAt: number | null;
    completedAt: number;
    streamed: boolean;
  },
): TranslationStreamUpdate | null {
  const unit = unitByPromptId.get(update.blockId);
  if (!unit) {
    return null;
  }

  return {
    blockId: unit.blockId,
    promptId: update.blockId,
    partIndex: unit.partIndex,
    partCount: unit.partCount,
    translation: update.translation,
    complete: update.complete,
    debugMetrics:
      update.complete
        ? buildDebugMetrics(
            unitToDebugBlock(unit),
            update.translation,
            debugContext,
            request,
          )
        : undefined,
  };
}

type TranslateMode = "fresh" | "resume";

type SingleBatchPayload = {
  mode: TranslateMode;
  units: TranslationUnit[];
  promptBlocks: PromptBlock[];
  completedBlocks?: CompletedBlock[];
};

async function* translateBatch(
  provider: LLMProvider,
  payload: SingleBatchPayload,
  targetLang: string,
  debugContext: DebugBatchContext,
  signal?: AbortSignal,
): AsyncGenerator<TranslationStreamUpdate> {
  const { mode, units, promptBlocks, completedBlocks = [] } = payload;
  const system =
    mode === "resume"
      ? buildContinueTranslationSystemPrompt(targetLang)
      : buildTranslationSystemPrompt(targetLang);
  const unitByPromptId = new Map(units.map((unit) => [unitPromptId(unit), unit]));
  let lastOutput = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    assertNotAborted(signal);

    let userContent: string;
    if (attempt === 0) {
      userContent =
        mode === "resume"
          ? buildContinueTranslationUserPrompt(completedBlocks, promptBlocks)
          : buildTranslationUserPrompt(promptBlocks);
    } else {
      userContent =
        mode === "resume"
          ? buildContinueRetryUserPrompt(completedBlocks, promptBlocks, lastOutput)
          : buildRetryUserPrompt(promptBlocks, lastOutput);
    }

    const streamState: StreamingTranslationState = {
      completedIds: new Set(),
      partialById: new Map(),
    };
    const requestStartedAt = nowMs();
    const firstTranslationAtById = new Map<string, number>();
    const inputUserChars = userContent.length;
    const inputSystemChars = system.length;
    const batchInputTokens = estimateTokensFromChars(inputUserChars + inputSystemChars);
    let accumulated = "";
    let firstContentAt: number | null = null;
    let streamed = false;

    const chatResult = provider.chat({
      system,
      messages: [{ role: "user", content: userContent }],
      stream: true,
      json: true,
      signal,
    });

    if (isAsyncIterable(chatResult)) {
      for await (const textChunk of chatResult) {
        streamed = true;
        if (firstContentAt === null) {
          firstContentAt = nowMs();
        }
        accumulated += textChunk;
        const updates = extractStreamingTranslationUpdates(accumulated, streamState);
        for (const update of updates) {
          const firstTranslationAt = recordFirstTranslationAt(firstTranslationAtById, update);
          const mapped = mapPromptTranslationUpdate(update, unitByPromptId, debugContext, {
            attempt: attempt + 1,
            inputUserChars,
            inputSystemChars,
            batchInputTokens,
            requestStartedAt,
            firstContentAt,
            firstTranslationAt,
            completedAt: nowMs(),
            streamed,
          });
          if (mapped) {
            yield mapped;
          }
        }
      }
    } else {
      const raw = await chatResult;
      firstContentAt = nowMs();
      accumulated = raw;
      for (const update of extractStreamingTranslationUpdates(raw, streamState)) {
        const firstTranslationAt = recordFirstTranslationAt(firstTranslationAtById, update);
        const mapped = mapPromptTranslationUpdate(update, unitByPromptId, debugContext, {
          attempt: attempt + 1,
          inputUserChars,
          inputSystemChars,
          batchInputTokens,
          requestStartedAt,
          firstContentAt,
          firstTranslationAt,
          completedAt: nowMs(),
          streamed,
        });
        if (mapped) {
          yield mapped;
        }
      }
    }

    lastOutput = accumulated;

    try {
      const parsed = parseTranslationBatchResponse(accumulated);
      for (const item of parsed.translations) {
        if (!streamState.completedIds.has(item.id)) {
          const completedAt = nowMs();
          const firstTranslationAt =
            recordFirstTranslationAt(firstTranslationAtById, {
              blockId: item.id,
              translation: item.translation,
            }) ?? completedAt;
          const mapped = mapPromptTranslationUpdate(
            { blockId: item.id, translation: item.translation, complete: true },
            unitByPromptId,
            debugContext,
            {
              attempt: attempt + 1,
              inputUserChars,
              inputSystemChars,
              batchInputTokens,
              requestStartedAt,
              firstContentAt,
              firstTranslationAt,
              completedAt,
              streamed,
            },
          );
          if (mapped) {
            yield mapped;
          }
        }
      }
      return;
    } catch {
      if (attempt === MAX_RETRIES) {
        throw new Error("Translation batch response invalid after retries");
      }
    }
  }

  throw new Error("Translation batch failed");
}

async function* translateIrBlocksOnce(
  ir: PaperIR,
  provider: LLMProvider,
  opts: TransformOpts,
  batchPayload: FullTranslationPayload | ResumeTranslationPayload,
  mode: TranslateMode,
): AsyncGenerator<TransformProgress> {
  const { units, promptBlocks } = batchPayload;
  const completedBlocks = "completedBlocks" in batchPayload ? batchPayload.completedBlocks : [];

  if (units.length === 0) {
    yield { type: "done", ir: PaperIRSchema.parse(ir) };
    return;
  }

  const partTranslations = new Map<string, Map<number, string>>();

  const applyUpdate = (
    update: TranslationStreamUpdate,
  ): { applied: boolean; translation: string; complete: boolean } => {
    if (!update.complete) {
      // Partial: don't write to IR — UI shows streaming display only
      if (update.partCount === 1) {
        return { applied: false, translation: update.translation, complete: false };
      }
      return { applied: false, translation: "", complete: false };
    }

    // Complete single-part
    if (update.partCount === 1) {
      applyTranslation(ir, update.blockId, update.translation);
      return { applied: true, translation: update.translation, complete: true };
    }

    // Complete multi-part: accumulate parts, apply when all arrive
    let parts = partTranslations.get(update.blockId);
    if (!parts) {
      parts = new Map();
      partTranslations.set(update.blockId, parts);
    }
    parts.set(update.partIndex, update.translation);

    if (parts.size < update.partCount) {
      return { applied: false, translation: "", complete: false };
    }

    const merged = Array.from({ length: update.partCount }, (_, index) =>
      parts!.get(index) ?? "",
    ).join("");
    partTranslations.delete(update.blockId);
    applyTranslation(ir, update.blockId, merged);
    return { applied: true, translation: merged, complete: true };
  };

  let succeeded = false;

  try {
    for await (const update of translateBatch(
      provider,
      { mode, units, promptBlocks, completedBlocks },
      opts.targetLang,
      {
        enabled: opts.debugMode === true,
        providerId: provider.id,
        modelLabel: opts.modelLabel,
        targetLang: opts.targetLang,
      },
      opts.signal,
    )) {
      assertNotAborted(opts.signal);

      const result = applyUpdate(update);

      if (result.complete && result.applied) {
        if (update.debugMetrics) {
          const block = findBlock(ir, update.blockId);
          if (block) {
            replaceBlock(ir, update.blockId, withTranslationDebugMetrics(block, update.debugMetrics));
          }
        }
        yield {
          type: "block-translated",
          blockId: update.blockId,
          translation: result.translation,
          partial: false,
          debugMetrics: update.debugMetrics,
        };
      } else if (!result.complete && update.partCount === 1) {
        // Partial single-part: surface for streaming UI display
        yield {
          type: "block-translated",
          blockId: update.blockId,
          translation: update.translation,
          partial: true,
        };
      }
    }

    succeeded = true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    // Mark any untranslated blocks as missing
    const unitBlockIds = new Set(units.map((u) => u.blockId));
    for (const blockId of unitBlockIds) {
      const block = findBlock(ir, blockId);
      if (block && !block.translation) {
        replaceBlock(ir, blockId, markTranslationMissing(block));
      }
    }

    const reason = error instanceof Error ? error.message : "LLM provider failed";
    yield { type: "degraded", ir: PaperIRSchema.parse(ir), reason };
    return;
  }

  if (!succeeded) {
    yield {
      type: "degraded",
      ir: PaperIRSchema.parse(ir),
      reason: "Translation failed",
    };
    return;
  }

  // Mark any blocks that the LLM silently omitted
  for (const unit of units) {
    const block = findBlock(ir, unit.blockId);
    if (block && !block.translation) {
      replaceBlock(ir, unit.blockId, markTranslationMissing(block));
    }
  }

  yield { type: "done", ir: PaperIRSchema.parse(ir) };
}

export function applyTranslationToIr(
  ir: PaperIR,
  blockId: string,
  translation: string,
): void {
  applyTranslation(ir, blockId, translation);
}

export async function* transformToIR(
  cleaned: CleanedResult,
  provider: LLMProvider,
  opts: TransformOpts,
): AsyncGenerator<TransformProgress> {
  assertNotAborted(opts.signal);

  const ir = buildBaseIR(cleaned, opts);
  yield {
    type: "structure",
    ir: {
      ...ir,
      abstractBlocks: ir.abstractBlocks.map((block) => ({ ...block })),
      blocks: ir.blocks.map((block) => ({ ...block })),
    },
  };

  const translatableCount =
    cleaned.abstractBlocks.filter(isTranslatableBlock).length +
    cleaned.blocks.filter(isTranslatableBlock).length;

  if (translatableCount === 0) {
    yield { type: "done", ir: PaperIRSchema.parse(ir) };
    return;
  }

  const payload = buildFullTranslationPayload(
    cleaned.abstractBlocks,
    cleaned.blocks,
  );

  yield* translateIrBlocksOnce(ir, provider, opts, payload, "fresh");
}

export async function* resumeTranslation(
  cachedIr: PaperIR,
  provider: LLMProvider,
  opts: TransformOpts,
): AsyncGenerator<TransformProgress> {
  assertNotAborted(opts.signal);

  const ir = cloneIr(cachedIr);
  yield { type: "structure", ir: cloneIr(ir) };

  if (isPaperTranslationComplete(ir)) {
    yield { type: "done", ir: PaperIRSchema.parse(ir) };
    return;
  }

  const payload = buildResumeTranslationPayload(ir);
  yield* translateIrBlocksOnce(ir, provider, opts, payload, "resume");
}
