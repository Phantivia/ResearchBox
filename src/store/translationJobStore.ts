import { create } from "zustand";
import { createProvider, type ProviderConfig } from "@/core/llm";
import {
  loadPaperWithTranslation,
  type LoadPaperWithTranslationProgress,
} from "@/core/pipeline/loadPaper";
import {
  countCompletedTranslationChars,
  countTranslatableChars,
  hasCompleteTranslation,
  isTranslatableBlock,
} from "@/core/transformer";
import type { Block } from "@/core/ir";

export type TranslationJobStatus = "running" | "done" | "error" | "cancelled";

export interface TranslationJob {
  routeId: string;
  projectId: string;
  status: TranslationJobStatus;
  totalBlocks: number;
  completedBlocks: number;
  error?: string;
}

export type TranslationEventListener = (
  event: LoadPaperWithTranslationProgress,
) => void;

export interface StartTranslationOpts {
  projectId: string;
  routeId: string;
  forceRefresh: boolean;
  providerConfig: ProviderConfig;
  targetLang: string;
  debugMode: boolean;
}

interface TranslationJobState {
  jobs: Record<string, TranslationJob>;
}

interface TranslationJobActions {
  startTranslation: (opts: StartTranslationOpts) => void;
  cancelTranslation: (routeId: string) => void;
  cancelAllTranslations: () => void;
  getJob: (routeId: string) => TranslationJob | undefined;
  subscribe: (routeId: string, listener: TranslationEventListener) => () => void;
}

const abortControllers = new Map<string, AbortController>();
const completedBlockIds = new Map<string, Set<string>>();
const blockCharWeights = new Map<string, Map<string, number>>();
const listeners = new Map<string, Set<TranslationEventListener>>();

function collectCompletedBlockIds(blocks: Block[]): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (isTranslatableBlock(block) && hasCompleteTranslation(block)) {
      ids.add(block.id);
    }
  }
  return ids;
}

function buildBlockCharWeights(blocks: Block[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const block of blocks) {
    if (isTranslatableBlock(block)) {
      weights.set(block.id, block.content.length);
    }
  }
  return weights;
}

function sumCompletedChars(
  completedIds: Set<string>,
  weights: Map<string, number>,
): number {
  let total = 0;
  for (const blockId of completedIds) {
    total += weights.get(blockId) ?? 0;
  }
  return total;
}

function emit(routeId: string, event: LoadPaperWithTranslationProgress): void {
  listeners.get(routeId)?.forEach((listener) => listener(event));
}

function upsertJob(
  set: (
    partial:
      | Partial<TranslationJobState>
      | ((state: TranslationJobState) => Partial<TranslationJobState>),
  ) => void,
  job: TranslationJob,
): void {
  set((state) => ({
    jobs: { ...state.jobs, [job.routeId]: job },
  }));
}

function removeJob(
  set: (
    partial:
      | Partial<TranslationJobState>
      | ((state: TranslationJobState) => Partial<TranslationJobState>),
  ) => void,
  routeId: string,
): void {
  set((state) => {
    const nextJobs = { ...state.jobs };
    delete nextJobs[routeId];
    return { jobs: nextJobs };
  });
}

async function runTranslationJob(
  opts: StartTranslationOpts,
  set: (
    partial:
      | Partial<TranslationJobState>
      | ((state: TranslationJobState) => Partial<TranslationJobState>),
  ) => void,
): Promise<void> {
  const { routeId, projectId } = opts;
  const controller = new AbortController();
  abortControllers.set(routeId, controller);
  completedBlockIds.set(routeId, new Set());
  blockCharWeights.set(routeId, new Map());

  upsertJob(set, {
    routeId,
    projectId,
    status: "running",
    totalBlocks: 0,
    completedBlocks: 0,
  });

  try {
    const provider = createProvider(opts.providerConfig);

    for await (const event of loadPaperWithTranslation(routeId, provider, {
      targetLang: opts.targetLang,
      modelLabel: opts.providerConfig.model,
      forceRefresh: opts.forceRefresh,
      debugMode: opts.debugMode,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted) {
        return;
      }

      if (event.type === "structure") {
        const weights = buildBlockCharWeights([
          ...event.ir.abstractBlocks,
          ...event.ir.blocks,
        ]);
        const completedIds = collectCompletedBlockIds([
          ...event.ir.abstractBlocks,
          ...event.ir.blocks,
        ]);
        blockCharWeights.set(routeId, weights);
        completedBlockIds.set(routeId, completedIds);
        upsertJob(set, {
          routeId,
          projectId,
          status: "running",
          totalBlocks: countTranslatableChars(event.ir),
          completedBlocks: sumCompletedChars(completedIds, weights),
        });
      }

      if (event.type === "block-translated" && !event.partial) {
        const ids = completedBlockIds.get(routeId) ?? new Set<string>();
        if (ids.has(event.blockId)) {
          continue;
        }

        ids.add(event.blockId);
        completedBlockIds.set(routeId, ids);
        const weights = blockCharWeights.get(routeId) ?? new Map<string, number>();
        const current = useTranslationJobStore.getState().jobs[routeId];
        if (current) {
          upsertJob(set, {
            ...current,
            completedBlocks: sumCompletedChars(ids, weights),
          });
        }
      }

      if (event.type === "done" || event.type === "degraded") {
        const totalBlocks = countTranslatableChars(event.ir);
        upsertJob(set, {
          routeId,
          projectId,
          status: "done",
          totalBlocks,
          completedBlocks: countCompletedTranslationChars(event.ir),
        });
      }

      emit(routeId, event);
    }

    removeJob(set, routeId);
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }

    const message =
      error instanceof Error ? error.message : "Translation failed";
    upsertJob(set, {
      routeId,
      projectId,
      status: "error",
      totalBlocks: useTranslationJobStore.getState().jobs[routeId]?.totalBlocks ?? 0,
      completedBlocks:
        useTranslationJobStore.getState().jobs[routeId]?.completedBlocks ?? 0,
      error: message,
    });
    throw error;
  } finally {
    abortControllers.delete(routeId);
    completedBlockIds.delete(routeId);
    blockCharWeights.delete(routeId);
  }
}

export const useTranslationJobStore = create<
  TranslationJobState & TranslationJobActions
>()((set, get) => ({
  jobs: {},

  getJob: (routeId) => get().jobs[routeId],

  subscribe: (routeId, listener) => {
    const current = listeners.get(routeId) ?? new Set();
    current.add(listener);
    listeners.set(routeId, current);
    return () => {
      const bucket = listeners.get(routeId);
      if (!bucket) {
        return;
      }
      bucket.delete(listener);
      if (bucket.size === 0) {
        listeners.delete(routeId);
      }
    };
  },

  startTranslation: (opts) => {
    const existing = get().jobs[opts.routeId];
    if (existing?.status === "running") {
      if (!opts.forceRefresh) {
        return;
      }
      get().cancelTranslation(opts.routeId);
    }

    void runTranslationJob(opts, set).catch(() => {
      // Errors are surfaced via job status and event listeners.
    });
  },

  cancelTranslation: (routeId) => {
    abortControllers.get(routeId)?.abort();
    abortControllers.delete(routeId);
    completedBlockIds.delete(routeId);
    blockCharWeights.delete(routeId);

    const existing = get().jobs[routeId];
    if (existing) {
      upsertJob(set, { ...existing, status: "cancelled" });
      window.setTimeout(() => {
        removeJob(set, routeId);
      }, 0);
    }
  },

  cancelAllTranslations: () => {
    for (const routeId of abortControllers.keys()) {
      abortControllers.get(routeId)?.abort();
    }
    abortControllers.clear();
    completedBlockIds.clear();
    blockCharWeights.clear();
    set({ jobs: {} });
  },
}));
