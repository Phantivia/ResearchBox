import { create } from "zustand";
import { buildBoundaryMarker } from "@/core/agent/boundary";
import type { ContextTokenBreakdown } from "@/core/agent/contextSize";
import { EMPTY_CONTEXT_BREAKDOWN } from "@/core/agent/contextSize";
import type { AgentMessage, ApprovalRequest, ContentBlock } from "@/core/agent/types";

export type PendingApproval = ApprovalRequest & {
  id: string;
  resolve: (ok: boolean) => void;
};

interface AgentStoreState {
  messages: AgentMessage[];
  pendingApprovals: PendingApproval[];
  runningTools: Record<string, { name: string; stage: string }>;
  boxOpen: boolean;
  streamingText: string;
  streamingThinking: string;
  contextBreakdown: ContextTokenBreakdown;
  artifactsVersion: number;
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
  setContextBreakdown: (breakdown: ContextTokenBreakdown) => void;
  setBoxOpen: (open: boolean) => void;
  openBox: () => void;
  closeBox: () => void;
  bumpArtifactsVersion: () => void;
  openArtifactPanel: (artifactId: string) => void;
  closeArtifactPanel: () => void;
  reset: () => void;
}

const initialState: AgentStoreState = {
  messages: [],
  pendingApprovals: [],
  runningTools: {},
  boxOpen: true,
  streamingText: "",
  streamingThinking: "",
  contextBreakdown: EMPTY_CONTEXT_BREAKDOWN,
  artifactsVersion: 0,
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

  setContextBreakdown: (breakdown) => set({ contextBreakdown: breakdown }),

  setBoxOpen: (open) => set({ boxOpen: open }),

  openBox: () => set({ boxOpen: true }),

  closeBox: () =>
    set((state) => ({
      boxOpen: false,
      messages: [...state.messages, buildBoundaryMarker()],
    })),

  bumpArtifactsVersion: () =>
    set((state) => ({
      artifactsVersion: state.artifactsVersion + 1,
    })),

  openArtifactPanel: (artifactId) => set({ artifactPanel: { artifactId } }),

  closeArtifactPanel: () => set({ artifactPanel: null }),

  reset: () => set(initialState),
}));
