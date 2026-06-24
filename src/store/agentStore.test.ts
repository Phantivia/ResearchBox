import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CONTEXT_BREAKDOWN } from "@/core/agent/contextSize";
import { useAgentStore } from "./agentStore";

beforeEach(() => {
  useAgentStore.getState().reset();
});

describe("useAgentStore", () => {
  it("truncateMessages keeps messages before index", () => {
    useAgentStore.getState().append({
      role: "user",
      content: [{ type: "text", text: "first" }],
    });
    useAgentStore.getState().append({
      role: "assistant",
      content: [{ type: "text", text: "second" }],
    });
    useAgentStore.getState().truncateMessages(1);
    expect(useAgentStore.getState().messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "first" }],
      },
    ]);
  });

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

  it("reset restores initial state including boxOpen", () => {
    useAgentStore.getState().append({
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    useAgentStore.getState().setStreaming({ text: "partial" });
    useAgentStore.getState().setContextBreakdown({
      systemPrompt: 10,
      conversation: 20,
      toolDefinition: 0,
      toolIO: 0,
    });
    useAgentStore.getState().closeBox();

    useAgentStore.getState().reset();

    const state = useAgentStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.pendingApprovals).toEqual([]);
    expect(state.runningTools).toEqual({});
    expect(state.streamingToolCalls).toEqual({});
    expect(state.boxOpen).toBe(true);
    expect(state.streamingText).toBe("");
    expect(state.streamingThinking).toBe("");
    expect(state.contextBreakdown).toEqual(EMPTY_CONTEXT_BREAKDOWN);
    expect(state.artifactsVersion).toBe(0);
    expect(state.sessionsVersion).toBe(0);
    expect(state.currentSessionId).toBeNull();
    expect(state.artifactPanel).toBeNull();
    expect(state.logoRevealGeneration).toBe(0);
    expect(state.skipSessionAutoRestore).toBe(false);
    expect(state.agentRunning).toBe(false);
    expect(state.agentStopping).toBe(false);
  });

  it("startNewSession with revealLogo increments logoRevealGeneration", () => {
    expect(useAgentStore.getState().logoRevealGeneration).toBe(0);

    useAgentStore.getState().startNewSession({ revealLogo: true });
    expect(useAgentStore.getState().logoRevealGeneration).toBe(1);

    useAgentStore.getState().startNewSession();
    expect(useAgentStore.getState().logoRevealGeneration).toBe(1);

    useAgentStore.getState().startNewSession({ revealLogo: true });
    expect(useAgentStore.getState().logoRevealGeneration).toBe(2);
  });

  it("startNewSession with revealLogo sets skipSessionAutoRestore until consumed", () => {
    useAgentStore.getState().startNewSession({ revealLogo: true });
    expect(useAgentStore.getState().skipSessionAutoRestore).toBe(true);

    useAgentStore.getState().startNewSession();
    expect(useAgentStore.getState().skipSessionAutoRestore).toBe(true);

    useAgentStore.getState().startNewSession({ skipAutoRestore: false });
    expect(useAgentStore.getState().skipSessionAutoRestore).toBe(false);
  });

  it("bumpArtifactsVersion increments artifactsVersion", () => {
    expect(useAgentStore.getState().artifactsVersion).toBe(0);
    useAgentStore.getState().bumpArtifactsVersion();
    expect(useAgentStore.getState().artifactsVersion).toBe(1);
  });

  it("defaults boxOpen to true", () => {
    expect(useAgentStore.getState().boxOpen).toBe(true);
  });

  it("closeBox sets boxOpen false and appends a boundary marker without removing history", () => {
    useAgentStore.getState().append({
      role: "user",
      content: [{ type: "text", text: "earlier search notes" }],
    });

    useAgentStore.getState().closeBox();

    const state = useAgentStore.getState();
    expect(state.boxOpen).toBe(false);
    expect(state.messages).toHaveLength(2);

    const prior = state.messages[0];
    expect(prior?.role).toBe("user");
    expect(prior?.content[0]).toEqual({ type: "text", text: "earlier search notes" });

    const marker = state.messages[1];
    expect(marker?.role).toBe("user");
    const markerText =
      marker?.content[0]?.type === "text" ? marker.content[0].text : "";
    expect(markerText).toContain("盒子已关闭");
    expect(markerText).toContain("绝对优先使用盒内");
  });

  it("openBox sets boxOpen true and preserves message history", () => {
    useAgentStore.getState().append({
      role: "user",
      content: [{ type: "text", text: "keep me" }],
    });
    useAgentStore.getState().closeBox();
    useAgentStore.getState().append({
      role: "user",
      content: [{ type: "text", text: "question after close" }],
    });
    const afterClose = useAgentStore.getState().messages;

    useAgentStore.getState().openBox();

    const state = useAgentStore.getState();
    expect(state.boxOpen).toBe(true);
    expect(state.messages).toEqual(afterClose);
    expect(state.messages).toHaveLength(3);
  });

  it("closeBox is a no-op when the box is already closed", () => {
    useAgentStore.getState().closeBox();
    const afterFirstClose = useAgentStore.getState().messages;

    useAgentStore.getState().closeBox();
    useAgentStore.getState().closeBox();

    const state = useAgentStore.getState();
    expect(state.boxOpen).toBe(false);
    expect(state.messages).toEqual(afterFirstClose);
    expect(state.messages).toHaveLength(1);
  });

  it("openBox undoes the boundary marker when no message was sent after close", () => {
    useAgentStore.getState().append({
      role: "user",
      content: [{ type: "text", text: "earlier search notes" }],
    });
    useAgentStore.getState().closeBox();

    useAgentStore.getState().openBox();

    const state = useAgentStore.getState();
    expect(state.boxOpen).toBe(true);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.content[0]).toEqual({
      type: "text",
      text: "earlier search notes",
    });
  });

  it("setBoxOpen toggles boxOpen without appending boundary marker", () => {
    useAgentStore.getState().setBoxOpen(false);
    expect(useAgentStore.getState().boxOpen).toBe(false);
    expect(useAgentStore.getState().messages).toEqual([]);

    useAgentStore.getState().setBoxOpen(true);
    expect(useAgentStore.getState().boxOpen).toBe(true);
  });

  it("tracks streaming tool input until cleared", () => {
    useAgentStore.getState().startStreamingTool("tool-1", "python");
    useAgentStore.getState().appendStreamingToolInput("tool-1", '{"code":"print(');
    useAgentStore.getState().appendStreamingToolInput("tool-1", '1)"}');

    expect(useAgentStore.getState().streamingToolCalls).toEqual({
      "tool-1": {
        name: "python",
        partialJson: '{"code":"print(1)"}',
      },
    });

    useAgentStore.getState().clearStreamingTools();
    expect(useAgentStore.getState().streamingToolCalls).toEqual({});
  });
});
