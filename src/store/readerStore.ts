import { create } from "zustand";
import type { PaperIR } from "@/core/ir";
import {
  clearTranslationSmoothingState,
  registerTranslationSmoothingHost,
  scheduleTranslationSmoothing,
} from "./translationSmoothing";
import { isPaperTranslationComplete, withTranslationDebugMetrics, type TranslationDebugMetrics } from "@/core/transformer";

export type ReaderStatus = "idle" | "loading" | "error" | "ready";

export type TranslationStatus =
  | "none"
  | "cached"
  | "partial"
  | "translating"
  | "done"
  | "degraded";

interface ReaderState {
  currentPaper: PaperIR | null;
  status: ReaderStatus;
  translationStatus: TranslationStatus;
  degradedReason?: string;
  error?: string;
  /** Smoothly-revealed partial text for each in-flight block. Shown in primary color. */
  streamingDisplays: Record<string, string>;
  /** The target text the smoothing is advancing toward for each block. */
  streamingTargets: Record<string, string>;
  streamingCompleteBlocks: Record<string, boolean>;
}

interface ReaderActions {
  setLoading: () => void;
  setError: (msg: string) => void;
  setPaper: (ir: PaperIR) => void;
  setPaperFromCache: (ir: PaperIR) => void;
  setPaperStructure: (ir: PaperIR) => void;
  setTranslating: () => void;
  setStreamingTarget: (
    blockId: string,
    target: string,
    complete?: boolean,
    debugMetrics?: TranslationDebugMetrics,
  ) => void;
  setPaperDone: (ir: PaperIR) => void;
  setDegraded: (ir: PaperIR, reason: string) => void;
  reset: () => void;
}

const EMPTY_STREAMING: Pick<ReaderState, "streamingDisplays" | "streamingTargets" | "streamingCompleteBlocks"> = {
  streamingDisplays: {},
  streamingTargets: {},
  streamingCompleteBlocks: {},
};

const initialState: ReaderState = {
  currentPaper: null,
  status: "idle",
  translationStatus: "none",
  degradedReason: undefined,
  error: undefined,
  ...EMPTY_STREAMING,
};

export const useReaderStore = create<ReaderState & ReaderActions>()((set) => ({
  ...initialState,

  setLoading: () => {
    clearTranslationSmoothingState();
    set({
      status: "loading",
      translationStatus: "none",
      degradedReason: undefined,
      error: undefined,
      ...EMPTY_STREAMING,
    });
  },

  setError: (msg: string) => {
    clearTranslationSmoothingState();
    set({
      status: "error",
      error: msg,
      translationStatus: "none",
      ...EMPTY_STREAMING,
    });
  },

  setPaper: (ir: PaperIR) => {
    clearTranslationSmoothingState();
    set({
      currentPaper: ir,
      status: "ready",
      translationStatus: "none",
      error: undefined,
      degradedReason: undefined,
      ...EMPTY_STREAMING,
    });
  },

  setPaperFromCache: (ir: PaperIR) => {
    clearTranslationSmoothingState();
    const complete = isPaperTranslationComplete(ir);
    const hasAnyTranslation = [...ir.abstractBlocks, ...ir.blocks].some((block) =>
      Boolean(block.translation?.trim()),
    );
    const translationStatus: TranslationStatus = complete
      ? "cached"
      : hasAnyTranslation
        ? "partial"
        : "none";

    set({
      currentPaper: ir,
      status: "ready",
      translationStatus,
      error: undefined,
      degradedReason: undefined,
      ...EMPTY_STREAMING,
    });
  },

  setPaperStructure: (ir: PaperIR) => {
    clearTranslationSmoothingState();
    set({
      currentPaper: ir,
      status: "ready",
      translationStatus: "translating",
      error: undefined,
      degradedReason: undefined,
      ...EMPTY_STREAMING,
    });
  },

  setTranslating: () => set({ translationStatus: "translating" }),

  setStreamingTarget: (blockId, target, complete = false, debugMetrics) =>
    set((state) => {
      if (complete) {
        // Block fully translated: persist into currentPaper.translation,
        // clear its streaming state so render switches to translation color.
        const nextPaper = state.currentPaper
          ? applyBlockTranslation(state.currentPaper, blockId, target, debugMetrics)
          : state.currentPaper;

        const { [blockId]: _sd, ...remainingDisplays } = state.streamingDisplays;
        const { [blockId]: _st, ...remainingTargets } = state.streamingTargets;
        const { [blockId]: _sc, ...remainingComplete } = state.streamingCompleteBlocks;

        return {
          currentPaper: nextPaper,
          streamingDisplays: remainingDisplays,
          streamingTargets: remainingTargets,
          streamingCompleteBlocks: remainingComplete,
          translationStatus: "translating",
        };
      }

      // Partial update: advance the smoothing target; smoothing will reveal
      // text into streamingDisplays at its own pace.
      scheduleTranslationSmoothing();

      return {
        streamingTargets: { ...state.streamingTargets, [blockId]: target },
        streamingCompleteBlocks: {
          ...state.streamingCompleteBlocks,
          [blockId]: false,
        },
        translationStatus: "translating",
      };
    }),

  setPaperDone: (ir: PaperIR) => {
    clearTranslationSmoothingState();
    set({
      currentPaper: ir,
      status: "ready",
      translationStatus: "done",
      error: undefined,
      degradedReason: undefined,
      ...EMPTY_STREAMING,
    });
  },

  setDegraded: (ir: PaperIR, reason: string) => {
    clearTranslationSmoothingState();
    set({
      currentPaper: ir,
      status: "ready",
      translationStatus: "degraded",
      degradedReason: reason,
      error: undefined,
      ...EMPTY_STREAMING,
    });
  },

  reset: () => {
    clearTranslationSmoothingState();
    set(initialState);
  },
}));

function applyBlockTranslation(
  paper: PaperIR,
  blockId: string,
  translation: string,
  debugMetrics?: TranslationDebugMetrics,
): PaperIR {
  const applyToBlocks = (blocks: PaperIR["blocks"]) => {
    let changed = false;
    const next = blocks.map((block) => {
      if (block.id !== blockId) return block;
      changed = true;
      let updated = { ...block, translation };
      if (debugMetrics) {
        updated = withTranslationDebugMetrics(updated, debugMetrics) as typeof updated;
      }
      return updated;
    });
    return changed ? next : blocks;
  };

  const abstractBlocks = applyToBlocks(paper.abstractBlocks);
  const blocks = applyToBlocks(paper.blocks);

  if (abstractBlocks === paper.abstractBlocks && blocks === paper.blocks) {
    return paper;
  }

  return { ...paper, abstractBlocks, blocks };
}

registerTranslationSmoothingHost({
  getSnapshot: () => {
    const state = useReaderStore.getState();
    return {
      translationStatus: state.translationStatus,
      streamingTargets: state.streamingTargets,
      streamingCompleteBlocks: state.streamingCompleteBlocks,
      streamingDisplays: state.streamingDisplays,
      getDisplayTranslation: (blockId) => state.streamingDisplays[blockId],
    };
  },
  applyDisplays: (updates) => {
    useReaderStore.setState((state) => {
      let changed = false;
      const next = { ...state.streamingDisplays };
      for (const [blockId, text] of Object.entries(updates)) {
        if (next[blockId] !== text) {
          next[blockId] = text;
          changed = true;
        }
      }
      return changed ? { streamingDisplays: next } : state;
    });
  },
  clearStreamingState: () => {
    useReaderStore.setState({ ...EMPTY_STREAMING });
  },
});
