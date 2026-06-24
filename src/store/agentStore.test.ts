import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "./agentStore";

beforeEach(() => {
  useAgentStore.getState().reset();
});

describe("useAgentStore", () => {
  it("append adds a message to messages", () => {
    const message = {
      role: "user" as const,
      content: [{ type: "text" as const, text: "hello" }],
    };

    useAgentStore.getState().append(message);

    expect(useAgentStore.getState().messages).toEqual([message]);
  });

  it("enqueueApproval returns id, resolveApproval calls resolve and dequeues", () => {
    const resolve = vi.fn<(ok: boolean) => void>();
    const request = {
      tool: "websearch",
      input: { query: "test" },
      reason: "needs web access",
      risk: "low" as const,
      resolve,
    };

    const id = useAgentStore.getState().enqueueApproval(request);

    expect(id).toBeTruthy();
    expect(useAgentStore.getState().pendingApprovals).toHaveLength(1);
    expect(useAgentStore.getState().pendingApprovals[0]?.id).toBe(id);

    useAgentStore.getState().resolveApproval(id, true);
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(true);
    expect(useAgentStore.getState().pendingApprovals).toEqual([]);

    const denyResolve = vi.fn<(ok: boolean) => void>();
    const denyId = useAgentStore.getState().enqueueApproval({
      ...request,
      resolve: denyResolve,
    });

    useAgentStore.getState().resolveApproval(denyId, false);
    expect(denyResolve).toHaveBeenCalledOnce();
    expect(denyResolve).toHaveBeenCalledWith(false);
    expect(useAgentStore.getState().pendingApprovals).toEqual([]);
  });

  it("commitStreamingToMessage creates an assistant message and clears streaming buffers", () => {
    useAgentStore.getState().setStreaming({ thinking: "planning", text: "answer" });

    useAgentStore.getState().commitStreamingToMessage();

    const state = useAgentStore.getState();
    expect(state.messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "thinking", text: "planning" },
          { type: "text", text: "answer" },
        ],
      },
    ]);
    expect(state.streamingText).toBe("");
    expect(state.streamingThinking).toBe("");
  });

  it("reset restores initial state", () => {
    useAgentStore.getState().append({
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    useAgentStore.getState().setStreaming({ text: "partial" });
    useAgentStore.getState().setContextChars(42);

    useAgentStore.getState().reset();

    const state = useAgentStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.pendingApprovals).toEqual([]);
    expect(state.runningTools).toEqual({});
    expect(state.permissionMode).toBe("default");
    expect(state.streamingText).toBe("");
    expect(state.streamingThinking).toBe("");
    expect(state.contextChars).toBe(0);
  });
});
