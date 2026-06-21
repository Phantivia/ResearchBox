import type { CleanBlock, CleanResult } from "@/core/cleaner";
import type { LLMProvider } from "@/core/llm";
import { PaperIRSchema, type Block, type PaperIR } from "@/core/ir";
import {
  chunkAbstractBlocksForTranslation,
  chunkBlocksForTranslation,
  DEFAULT_MAX_CHUNK_CHARS,
  isTranslatableBlock,
  unitPromptId,
  type TranslationChunk,
  type TranslationUnit,
} from "./chunk";
import {
  buildRetryUserPrompt,
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
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
import { hasCompleteTranslation, isPaperTranslationComplete } from "./completion";

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
const BODY_DELAY_AFTER_ABSTRACT_STREAM_MS = 1000;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Transform aborted", "AbortError");
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Transform aborted", "AbortError"));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

function chunkBlocksNeedingTranslation(
  blocks: Block[],
  precedingBlocks: Block[] = [],
): TranslationChunk[] {
  const pending = blocks.filter(
    (block) =>
      isTranslatableBlock(block as CleanBlock) &&
      !hasCompleteTranslation(block),
  );
  return chunkBlocksForTranslation(
    pending as CleanBlock[],
    DEFAULT_MAX_CHUNK_CHARS,
    precedingBlocks as CleanBlock[],
  );
}

function chunkAbstractBlocksNeedingTranslation(blocks: Block[]): TranslationChunk[] {
  const pending = blocks.filter(
    (block) =>
      isTranslatableBlock(block as CleanBlock) &&
      !hasCompleteTranslation(block),
  );
  return chunkAbstractBlocksForTranslation(pending as CleanBlock[]);
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

type TranslationBatchEvent =
  | {
      type: "update";
      update: TranslationStreamUpdate;
    }
  | {
      type: "settled";
      chunk: TranslationChunk;
      translatedPromptIds: Set<string>;
      error?: unknown;
    };

type TranslateBatchHooks = {
  onStreamStart?: () => void;
};

type DebugBatchContext = {
  enabled: boolean;
  providerId: string;
  modelLabel: string;
  targetLang: string;
  batchIndex: number;
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
    batchIndex: context.batchIndex,
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

async function* translateBatch(
  provider: LLMProvider,
  translationChunk: TranslationChunk,
  targetLang: string,
  debugContext: DebugBatchContext,
  signal?: AbortSignal,
  hooks?: TranslateBatchHooks,
): AsyncGenerator<TranslationStreamUpdate> {
  const promptBlocks = translationChunk.units.map((unit) => ({
    id: unitPromptId(unit),
    content: unit.content,
  }));
  const system = buildTranslationSystemPrompt(targetLang);
  const unitByPromptId = new Map(
    translationChunk.units.map((unit) => [unitPromptId(unit), unit]),
  );
  let lastOutput = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    assertNotAborted(signal);

    const userContent =
      attempt === 0
        ? buildTranslationUserPrompt(promptBlocks, translationChunk.contextBlocks)
        : buildRetryUserPrompt(
            promptBlocks,
            lastOutput,
            translationChunk.contextBlocks,
          );

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

    let streamStarted = false;
    const markStreamStarted = () => {
      if (streamStarted) return;
      streamStarted = true;
      hooks?.onStreamStart?.();
    };

    if (isAsyncIterable(chatResult)) {
      for await (const textChunk of chatResult) {
        markStreamStarted();
        streamed = true;
        if (firstContentAt === null) {
          firstContentAt = nowMs();
        }
        accumulated += textChunk;
        const updates = extractStreamingTranslationUpdates(accumulated, streamState);
        for (const update of updates) {
          const firstTranslationAt = recordFirstTranslationAt(
            firstTranslationAtById,
            update,
          );
          const mapped = mapPromptTranslationUpdate(
            update,
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
              completedAt: nowMs(),
              streamed,
            },
          );
          if (mapped) {
            yield mapped;
          }
        }
      }
    } else {
      const raw = await chatResult;
      markStreamStarted();
      firstContentAt = nowMs();
      accumulated = raw;
      for (const update of extractStreamingTranslationUpdates(raw, streamState)) {
        const firstTranslationAt =
          recordFirstTranslationAt(firstTranslationAtById, update);
        const mapped = mapPromptTranslationUpdate(
          update,
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
            completedAt: nowMs(),
            streamed,
          },
        );
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
            {
              blockId: item.id,
              translation: item.translation,
              complete: true,
            },
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

async function* translateChunksStaged(
  provider: LLMProvider,
  abstractChunks: TranslationChunk[],
  bodyChunks: TranslationChunk[],
  targetLang: string,
  debugContextBase: Omit<DebugBatchContext, "batchIndex">,
  signal?: AbortSignal,
): AsyncGenerator<TranslationBatchEvent> {
  const queue: TranslationBatchEvent[] = [];
  let activeCount = 0;
  let bodyLaunchScheduled = false;
  let pendingLaunches = 0;
  let nextBatchIndex = 0;
  let wake: (() => void) | undefined;

  const notify = () => {
    wake?.();
    wake = undefined;
  };

  const enqueue = (event: TranslationBatchEvent) => {
    queue.push(event);
    notify();
  };

  const runChunk = async (
    chunk: TranslationChunk,
    hooks?: TranslateBatchHooks,
  ): Promise<void> => {
    activeCount += 1;
    const batchIndex = nextBatchIndex;
    nextBatchIndex += 1;
    const translatedPromptIds = new Set<string>();
    try {
      for await (const update of translateBatch(
        provider,
        chunk,
        targetLang,
        { ...debugContextBase, batchIndex },
        signal,
        hooks,
      )) {
        translatedPromptIds.add(update.promptId);
        enqueue({ type: "update", update });
      }
      enqueue({ type: "settled", chunk, translatedPromptIds });
    } catch (error) {
      enqueue({ type: "settled", chunk, translatedPromptIds, error });
    } finally {
      activeCount -= 1;
      notify();
    }
  };

  const launchBodyBatches = async (delayMs: number) => {
    try {
      await delay(delayMs, signal);
      await Promise.all(bodyChunks.map((chunk) => runChunk(chunk)));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
    }
  };

  const scheduleBodyLaunch = (delayMs: number) => {
    if (bodyLaunchScheduled || bodyChunks.length === 0) {
      return;
    }
    bodyLaunchScheduled = true;
    pendingLaunches += 1;
    void launchBodyBatches(delayMs).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      throw error;
    }).finally(() => {
      pendingLaunches -= 1;
      notify();
    });
  };

  if (abstractChunks.length > 0) {
    void (async () => {
      for (const chunk of abstractChunks) {
        try {
          await runChunk(chunk, {
            onStreamStart: () =>
              scheduleBodyLaunch(BODY_DELAY_AFTER_ABSTRACT_STREAM_MS),
          });
        } finally {
          if (!bodyLaunchScheduled && bodyChunks.length > 0) {
            scheduleBodyLaunch(0);
          }
        }
      }
    })();
  } else if (bodyChunks.length > 0) {
    scheduleBodyLaunch(0);
  }

  while (activeCount > 0 || pendingLaunches > 0 || queue.length > 0) {
    while (queue.length > 0) {
      const event = queue.shift();
      if (event) {
        yield event;
      }
    }

    if (activeCount === 0 && pendingLaunches === 0) {
      break;
    }

    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
}

async function* translateIrBlocks(
  ir: PaperIR,
  provider: LLMProvider,
  opts: TransformOpts,
  abstractChunks: TranslationChunk[],
  bodyChunks: TranslationChunk[],
): AsyncGenerator<TransformProgress> {
  if (abstractChunks.length === 0 && bodyChunks.length === 0) {
    yield { type: "done", ir: PaperIRSchema.parse(ir) };
    return;
  }

  let successfulBatches = 0;
  let firstFailureReason = "";
  const partTranslations = new Map<string, Map<number, string>>();

  const applyTranslationUpdate = (
    update: TranslationStreamUpdate,
  ): { applied: boolean; translation: string; complete: boolean } => {
    if (update.partCount === 1) {
      applyTranslation(ir, update.blockId, update.translation);
      return {
        applied: true,
        translation: update.translation,
        complete: update.complete,
      };
    }

    if (!update.complete) {
      return {
        applied: false,
        translation: update.translation,
        complete: false,
      };
    }

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

  const markChunkBlocksMissing = (chunk: TranslationChunk): void => {
    const blockIds = new Set(chunk.units.map((unit) => unit.blockId));
    for (const blockId of blockIds) {
      const target = findBlock(ir, blockId);
      if (target) {
        replaceBlock(ir, blockId, markTranslationMissing(target));
      }
    }
  };

  for await (const event of translateChunksStaged(
    provider,
    abstractChunks,
    bodyChunks,
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

    if (event.type === "update") {
      const applied = applyTranslationUpdate(event.update);
      if (applied.applied && event.update.debugMetrics) {
        const block = findBlock(ir, event.update.blockId);
        if (block) {
          replaceBlock(
            ir,
            event.update.blockId,
            withTranslationDebugMetrics(block, event.update.debugMetrics),
          );
        }
      }
      if (applied.applied) {
        yield {
          type: "block-translated",
          blockId: event.update.blockId,
          translation: applied.translation,
          partial: !applied.complete,
          debugMetrics: event.update.debugMetrics,
        };
      } else if (event.update.partCount === 1) {
        yield {
          type: "block-translated",
          blockId: event.update.blockId,
          translation: event.update.translation,
          partial: true,
          debugMetrics: event.update.debugMetrics,
        };
      }
      continue;
    }

    if (event.error) {
      if (event.error instanceof DOMException && event.error.name === "AbortError") {
        throw event.error;
      }

      firstFailureReason ||= event.error instanceof Error
        ? event.error.message
        : "LLM provider failed";

      markChunkBlocksMissing(event.chunk);
      continue;
    }

    successfulBatches += 1;

    for (const unit of event.chunk.units) {
      if (!event.translatedPromptIds.has(unitPromptId(unit))) {
        const target = findBlock(ir, unit.blockId);
        if (target) {
          replaceBlock(ir, unit.blockId, markTranslationMissing(target));
        }
      }
    }
  }

  const finalIr = PaperIRSchema.parse(ir);

  if (firstFailureReason && successfulBatches === 0) {
    yield {
      type: "degraded",
      ir: finalIr,
      reason: firstFailureReason,
    };
    return;
  }

  if (successfulBatches === 0) {
    yield {
      type: "degraded",
      ir: finalIr,
      reason: "All translation batches failed",
    };
    return;
  }

  yield { type: "done", ir: finalIr };
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

  const abstractChunks = chunkAbstractBlocksForTranslation(
    cleaned.abstractBlocks,
  );
  const bodyChunks = chunkBlocksForTranslation(
    cleaned.blocks,
    DEFAULT_MAX_CHUNK_CHARS,
    cleaned.abstractBlocks,
  );
  const translatableCount =
    cleaned.abstractBlocks.filter(isTranslatableBlock).length +
    cleaned.blocks.filter(isTranslatableBlock).length;

  if (translatableCount === 0) {
    yield { type: "done", ir: PaperIRSchema.parse(ir) };
    return;
  }

  yield* translateIrBlocks(ir, provider, opts, abstractChunks, bodyChunks);
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

  const abstractChunks = chunkAbstractBlocksNeedingTranslation(ir.abstractBlocks);
  const bodyChunks = chunkBlocksNeedingTranslation(
    ir.blocks,
    ir.abstractBlocks,
  );
  yield* translateIrBlocks(ir, provider, opts, abstractChunks, bodyChunks);
}
