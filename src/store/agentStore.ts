import { create } from "zustand";
import { buildBoundaryMarker, isBoundaryMarker } from "@/core/agent/boundary";
import { abortActiveAgentRun } from "@/core/agent/runController";
import type { ContextTokenBreakdown } from "@/core/agent/contextSize";
import { EMPTY_CONTEXT_BREAKDOWN } from "@/core/agent/contextSize";
import {
  buildComposerPrefix,
  buildIgnoreMarker,
  buildIncludeMarker,
  type RecommendationDecision,
  removeEditableMarkersForArxiv,
} from "@/core/agent/recommendation/markers";
import type { PaperRecommendation } from "@/core/agent/recommendation/types";
import type { AgentSession } from "@/core/agent/session";
import type { AgentMessage, ApprovalRequest, ContentBlock } from "@/core/agent/types";

export type RecommendationSession = {
  toolUseId: string;
  papers: PaperRecommendation[];
  decisions: Record<string, RecommendationDecision>;
};

export type PendingApproval = ApprovalRequest & {
  id: string;
  resolve: (ok: boolean) => void;
};

export type StreamingToolCall = {
  name: string;
  partialJson: string;
};

export type StartNewSessionOptions = {
  revealLogo?: boolean;
  skipAutoRestore?: boolean;
};

interface AgentStoreState {
  messages: AgentMessage[];
  currentSessionId: number | null;
  pendingApprovals: PendingApproval[];
  runningTools: Record<string, { name: string; stage: string }>;
  streamingToolCalls: Record<string, StreamingToolCall>;
  boxOpen: boolean;
  logoRevealGeneration: number;
  streamingText: string;
  streamingThinking: string;
  contextBreakdown: ContextTokenBreakdown;
  artifactsVersion: number;
  sessionsVersion: number;
  artifactPanel: { artifactId: string } | null;
  recommendationSession: RecommendationSession | null;
  composerInputPrefix: string;
  skipSessionAutoRestore: boolean;
  agentRunning: boolean;
  agentStopping: boolean;
}

interface AgentStoreActions {
  append: (m: AgentMessage) => void;
  updateMessageAtIndex: (index: number, message: AgentMessage) => void;
  truncateMessages: (toIndex: number) => void;
  setStreaming: (partial: { text?: string; thinking?: string }) => void;
  commitStreamingToMessage: () => void;
  enqueueApproval: (req: ApprovalRequest & { resolve: (ok: boolean) => void }) => string;
  resolveApproval: (id: string, ok: boolean) => void;
  setRunningTool: (id: string, info: { name: string; stage: string }) => void;
  clearRunningTool: (id: string) => void;
  startStreamingTool: (id: string, name: string) => void;
  appendStreamingToolInput: (id: string, partialJson: string) => void;
  clearStreamingTools: () => void;
  setContextBreakdown: (breakdown: ContextTokenBreakdown) => void;
  setBoxOpen: (open: boolean) => void;
  openBox: () => void;
  closeBox: () => void;
  bumpArtifactsVersion: () => void;
  openArtifactPanel: (artifactId: string) => void;
  closeArtifactPanel: () => void;
  openRecommendationSession: (toolUseId: string, papers: PaperRecommendation[]) => void;
  closeRecommendationSession: () => void;
  setRecommendationDecision: (
    arxivId: string,
    decision: RecommendationDecision | null,
  ) => void;
  commitRecommendationOnSend: () => void;
  loadSession: (session: AgentSession) => void;
  startNewSession: (options?: StartNewSessionOptions) => void;
  setCurrentSessionId: (id: number | null) => void;
  bumpSessionsVersion: () => void;
  setAgentRunning: (running: boolean) => void;
  setAgentStopping: (stopping: boolean) => void;
  reset: () => void;
}

const initialState: AgentStoreState = {
  messages: [],
  currentSessionId: null,
  pendingApprovals: [],
  runningTools: {},
  streamingToolCalls: {},
  boxOpen: true,
  logoRevealGeneration: 0,
  streamingText: "",
  streamingThinking: "",
  contextBreakdown: EMPTY_CONTEXT_BREAKDOWN,
  artifactsVersion: 0,
  sessionsVersion: 0,
  artifactPanel: null,
  recommendationSession: null,
  composerInputPrefix: "",
  skipSessionAutoRestore: false,
  agentRunning: false,
  agentStopping: false,
};

export const useAgentStore = create<AgentStoreState & AgentStoreActions>()((set) => ({
  ...initialState,

  append: (m) =>
    set((state) => ({
      messages: [...state.messages, m],
    })),

  updateMessageAtIndex: (index, message) =>
    set((state) => {
      if (index < 0 || index >= state.messages.length) {
        return state;
      }
      const messages = [...state.messages];
      messages[index] = message;
      return { messages };
    }),

  truncateMessages: (toIndex) =>
    set((state) => ({
      messages: state.messages.slice(0, toIndex),
    })),

  setStreaming: (partial) =>
    set((state) => ({
      streamingText: partial.text ?? state.streamingText,
      streamingThinking: partial.thinking ?? state.streamingThinking,
    })),

  commitStreamingToMessage: () =>
    set((state) => {
      const content: ContentBlock[] = [];
      if (state.streamingThinking) {
        content.push({ type: "thinking", text: state.streamingThinking });
      }
      if (state.streamingText) {
        content.push({ type: "text", text: state.streamingText });
      }
      if (content.length === 0) {
        return { streamingText: "", streamingThinking: "" };
      }
      return {
        messages: [...state.messages, { role: "assistant", content }],
        streamingText: "",
        streamingThinking: "",
      };
    }),

  enqueueApproval: (req) => {
    const id = crypto.randomUUID();
    set((state) => ({
      pendingApprovals: [...state.pendingApprovals, { ...req, id }],
    }));
    return id;
  },

  resolveApproval: (id, ok) =>
    set((state) => {
      const item = state.pendingApprovals.find((entry) => entry.id === id);
      if (!item) {
        return state;
      }
      item.resolve(ok);
      return {
        pendingApprovals: state.pendingApprovals.filter((entry) => entry.id !== id),
      };
    }),

  setRunningTool: (id, info) =>
    set((state) => ({
      runningTools: { ...state.runningTools, [id]: info },
    })),

  clearRunningTool: (id) =>
    set((state) => {
      const { [id]: _removed, ...rest } = state.runningTools;
      return { runningTools: rest };
    }),

  startStreamingTool: (id, name) =>
    set((state) => ({
      streamingToolCalls: {
        ...state.streamingToolCalls,
        [id]: { name, partialJson: "" },
      },
    })),

  appendStreamingToolInput: (id, partialJson) =>
    set((state) => {
      const current = state.streamingToolCalls[id];
      if (!current) {
        return state;
      }
      return {
        streamingToolCalls: {
          ...state.streamingToolCalls,
          [id]: {
            ...current,
            partialJson: current.partialJson + partialJson,
          },
        },
      };
    }),

  clearStreamingTools: () => set({ streamingToolCalls: {} }),

  setContextBreakdown: (breakdown) => set({ contextBreakdown: breakdown }),

  setBoxOpen: (open) => set({ boxOpen: open }),

  openBox: () =>
    set((state) => {
      if (state.boxOpen) {
        return state;
      }
      const lastMessage = state.messages[state.messages.length - 1];
      const messages =
        lastMessage && isBoundaryMarker(lastMessage)
          ? state.messages.slice(0, -1)
          : state.messages;
      return { boxOpen: true, messages };
    }),

  closeBox: () =>
    set((state) => {
      if (!state.boxOpen) {
        return state;
      }
      return {
        boxOpen: false,
        messages: [...state.messages, buildBoundaryMarker()],
      };
    }),

  bumpArtifactsVersion: () =>
    set((state) => ({
      artifactsVersion: state.artifactsVersion + 1,
    })),

  openArtifactPanel: (artifactId) => set({ artifactPanel: { artifactId } }),

  closeArtifactPanel: () => set({ artifactPanel: null }),

  openRecommendationSession: (toolUseId, papers) =>
    set({
      recommendationSession: {
        toolUseId,
        papers,
        decisions: {},
      },
    }),

  closeRecommendationSession: () =>
    set({
      recommendationSession: null,
    }),

  setRecommendationDecision: (arxivId, decision) =>
    set((state) => {
      if (!state.recommendationSession) {
        return state;
      }

      let messages = removeEditableMarkersForArxiv(state.messages, arxivId);
      const decisions = { ...state.recommendationSession.decisions };

      if (decision === null) {
        delete decisions[arxivId];
      } else {
        decisions[arxivId] = decision;
        messages = [
          ...messages,
          decision === "included"
            ? buildIncludeMarker(arxivId)
            : buildIgnoreMarker(arxivId),
        ];
      }

      return {
        messages,
        recommendationSession: {
          ...state.recommendationSession,
          decisions,
        },
        composerInputPrefix: buildComposerPrefix(decisions),
      };
    }),

  commitRecommendationOnSend: () =>
    set((state) => {
      if (!state.recommendationSession) {
        return { composerInputPrefix: "" };
      }

      const remainingPapers = state.recommendationSession.papers.filter(
        (paper) => state.recommendationSession!.decisions[paper.arxivId] !== "ignored",
      );
      const decisions = Object.fromEntries(
        Object.entries(state.recommendationSession.decisions).filter(
          ([arxivId]) => remainingPapers.some((paper) => paper.arxivId === arxivId),
        ),
      ) as Record<string, RecommendationDecision>;

      if (remainingPapers.length === 0) {
        return {
          recommendationSession: null,
          composerInputPrefix: "",
        };
      }

      return {
        recommendationSession: {
          ...state.recommendationSession,
          papers: remainingPapers,
          decisions,
        },
        composerInputPrefix: "",
      };
    }),

  loadSession: (session) => {
    const state = useAgentStore.getState();
    if (state.agentRunning && session.id !== state.currentSessionId) {
      abortActiveAgentRun();
    }
    set({
      messages: session.messages,
      currentSessionId: session.id ?? null,
      pendingApprovals: [],
      runningTools: {},
      streamingToolCalls: {},
      streamingText: "",
      streamingThinking: "",
      recommendationSession: null,
      composerInputPrefix: "",
    });
  },

  startNewSession: (options) => {
    if (useAgentStore.getState().agentRunning) {
      abortActiveAgentRun();
    }
    set((state) => {
      const skipSessionAutoRestore =
        options?.revealLogo === true
          ? true
          : options?.skipAutoRestore === false
            ? false
            : options?.skipAutoRestore === true
              ? true
              : state.skipSessionAutoRestore;

      return {
        messages: [],
        currentSessionId: null,
        pendingApprovals: [],
        runningTools: {},
        streamingToolCalls: {},
        streamingText: "",
        streamingThinking: "",
        contextBreakdown: EMPTY_CONTEXT_BREAKDOWN,
        boxOpen: state.boxOpen,
        artifactsVersion: state.artifactsVersion,
        sessionsVersion: state.sessionsVersion,
        artifactPanel: state.artifactPanel,
        recommendationSession: null,
        composerInputPrefix: "",
        logoRevealGeneration: options?.revealLogo
          ? state.logoRevealGeneration + 1
          : state.logoRevealGeneration,
        skipSessionAutoRestore,
      };
    });
  },

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  bumpSessionsVersion: () =>
    set((state) => ({
      sessionsVersion: state.sessionsVersion + 1,
    })),

  setAgentRunning: (running) => set({ agentRunning: running }),

  setAgentStopping: (stopping) => set({ agentStopping: stopping }),

  reset: () => set(initialState),
}));
