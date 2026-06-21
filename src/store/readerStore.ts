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

const initialState: ReaderState = {
  currentPaper: null,
  status: "idle",
  translationStatus: "none",
  degradedReason: undefined,
  error: undefined,
  streamingTargets: {},
  streamingCompleteBlocks: {},
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
      streamingTargets: {},
      streamingCompleteBlocks: {},
    });
  },

  setError: (msg: string) => {
    clearTranslationSmoothingState();
    set({
      status: "error",
      error: msg,
      translationStatus: "none",
      streamingTargets: {},
      streamingCompleteBlocks: {},
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
      streamingTargets: {},
      streamingCompleteBlocks: {},
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
      streamingTargets: {},
      streamingCompleteBlocks: {},
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
      streamingTargets: {},
      streamingCompleteBlocks: {},
    });
  },

  setTranslating: () => set({ translationStatus: "translating" }),

  setStreamingTarget: (blockId, target, complete = false, debugMetrics) =>
    set((state) => {
      const nextComplete = complete
        ? true
        : (state.streamingCompleteBlocks[blockId] ?? false);
      const currentPaper =
        debugMetrics && state.currentPaper
          ? applyDebugMetrics(state.currentPaper, blockId, debugMetrics)
          : state.currentPaper;

      scheduleTranslationSmoothing();

      return {
        currentPaper,
        streamingTargets: { ...state.streamingTargets, [blockId]: target },
        streamingCompleteBlocks: {
          ...state.streamingCompleteBlocks,
          [blockId]: nextComplete,
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
      streamingTargets: {},
      streamingCompleteBlocks: {},
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
      streamingTargets: {},
      streamingCompleteBlocks: {},
    });
  },

  reset: () => {
    clearTranslationSmoothingState();
    set(initialState);
  },
}));

function applyDebugMetrics(
  paper: PaperIR,
  blockId: string,
  debugMetrics: TranslationDebugMetrics,
): PaperIR {
  const applyToBlocks = (blocks: PaperIR["blocks"]) => {
    let changed = false;
    const next = blocks.map((block) => {
      if (block.id !== blockId) {
        return block;
      }
      changed = true;
      return withTranslationDebugMetrics(block, debugMetrics);
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

function getDisplayTranslation(
  paper: PaperIR | null,
  blockId: string,
): string | undefined {
  if (!paper) {
    return undefined;
  }
  const block =
    paper.abstractBlocks.find((item) => item.id === blockId) ??
    paper.blocks.find((item) => item.id === blockId);
  return block?.translation;
}

registerTranslationSmoothingHost({
  getSnapshot: () => {
    const state = useReaderStore.getState();
    return {
      translationStatus: state.translationStatus,
      streamingTargets: state.streamingTargets,
      streamingCompleteBlocks: state.streamingCompleteBlocks,
      getDisplayTranslation: (blockId) =>
        getDisplayTranslation(state.currentPaper, blockId),
    };
  },
  applyDisplays: (updates) => {
    useReaderStore.setState((state) => {
      if (!state.currentPaper) {
        return state;
      }

      const applyToBlocks = (blocks: PaperIR["blocks"]) => {
        let changed = false;
        const next = blocks.map((block) => {
          const translation = updates[block.id];
          if (translation === undefined || translation === block.translation) {
            return block;
          }
          changed = true;
          return { ...block, translation };
        });
        return changed ? next : blocks;
      };

      const abstractBlocks = applyToBlocks(state.currentPaper.abstractBlocks);
      const blocks = applyToBlocks(state.currentPaper.blocks);

      if (
        abstractBlocks === state.currentPaper.abstractBlocks &&
        blocks === state.currentPaper.blocks
      ) {
        return state;
      }

      return {
        currentPaper: {
          ...state.currentPaper,
          abstractBlocks,
          blocks,
        },
      };
    });
  },
  clearStreamingState: () => {
    useReaderStore.setState({
      streamingTargets: {},
      streamingCompleteBlocks: {},
    });
  },
});
