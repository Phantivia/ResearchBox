import { create } from "zustand";
import { buildBoundaryMarker, isBoundaryMarker } from "@/core/agent/boundary";
import type { ContextTokenBreakdown } from "@/core/agent/contextSize";
import { EMPTY_CONTEXT_BREAKDOWN } from "@/core/agent/contextSize";
import type { AgentSession } from "@/core/agent/session";
import type { AgentMessage, ApprovalRequest, ContentBlock } from "@/core/agent/types";

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
}

interface AgentStoreActions {
  append: (m: AgentMessage) => void;
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
  loadSession: (session: AgentSession) => void;
  startNewSession: (options?: StartNewSessionOptions) => void;
  setCurrentSessionId: (id: number | null) => void;
  bumpSessionsVersion: () => void;
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
};

export const useAgentStore = create<AgentStoreState & AgentStoreActions>()((set) => ({
  ...initialState,

  append: (m) =>
    set((state) => ({
      messages: [...state.messages, m],
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

  loadSession: (session) =>
    set({
      messages: session.messages,
      currentSessionId: session.id ?? null,
      pendingApprovals: [],
      runningTools: {},
      streamingToolCalls: {},
      streamingText: "",
      streamingThinking: "",
    }),

  startNewSession: (options) =>
    set((state) => ({
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
      logoRevealGeneration: options?.revealLogo
        ? state.logoRevealGeneration + 1
        : state.logoRevealGeneration,
    })),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  bumpSessionsVersion: () =>
    set((state) => ({
      sessionsVersion: state.sessionsVersion + 1,
    })),

  reset: () => set(initialState),
}));
