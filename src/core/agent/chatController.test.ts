import { describe, expect, it, vi } from "vitest";
import { runChat } from "./chatController";
import type { AgentMessage } from "./types";
import type { ChatOptions, LLMProvider } from "@/core/llm/types";

const userMessage: AgentMessage = {
  role: "user",
  content: [{ type: "text", text: "hello" }],
};

describe("runChat", () => {
  it("streams deltas in order and calls onDone with the full text", async () => {
    const deltas: string[] = [];
    let doneResult: { text: string; thinking: string } | undefined;
    const chat = vi.fn((_opts: ChatOptions) =>
      (async function* () {
        yield "hel";
        yield "lo";
      })(),
    );

    const provider: LLMProvider = { id: "mock-stream", chat };

    await runChat({
      provider,
      system: "You are helpful.",
      messages: [userMessage],
      signal: new AbortController().signal,
      onDelta: (text) => deltas.push(text),
      onDone: (result) => {
        doneResult = result;
      },
      onError: () => {
        throw new Error("onError should not be called");
      },
    });

    expect(deltas).toEqual(["hel", "lo"]);
    expect(doneResult).toEqual({ text: "hello", thinking: "" });
    expect(chat).toHaveBeenCalledWith({
      system: "You are helpful.",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
      signal: expect.any(AbortSignal),
    });
  });

  it("calls onDone with the resolved string for non-streaming chat results", async () => {
    let doneResult: { text: string; thinking: string } | undefined;
    const provider: LLMProvider = {
      id: "mock-promise",
      chat: () => Promise.resolve("full reply"),
    };

    await runChat({
      provider,
      system: "sys",
      messages: [userMessage],
      signal: new AbortController().signal,
      onDelta: () => {
        throw new Error("onDelta should not be called");
      },
      onDone: (result) => {
        doneResult = result;
      },
      onError: () => {
        throw new Error("onError should not be called");
      },
    });

    expect(doneResult).toEqual({ text: "full reply", thinking: "" });
  });

  it("streams thinking chunks separately from text", async () => {
    const thinkingDeltas: string[] = [];
    const textDeltas: string[] = [];
    let doneResult: { text: string; thinking: string } | undefined;
    const provider: LLMProvider = {
      id: "mock-thinking",
      chat: () =>
        (async function* () {
          yield { type: "thinking", text: "think" };
          yield { type: "thinking", text: "ing" };
          yield "ans";
          yield "wer";
        })(),
    };

    await runChat({
      provider,
      system: "sys",
      messages: [userMessage],
      signal: new AbortController().signal,
      onThinkingDelta: (text) => thinkingDeltas.push(text),
      onDelta: (text) => textDeltas.push(text),
      onDone: (result) => {
        doneResult = result;
      },
      onError: () => {
        throw new Error("onError should not be called");
      },
    });

    expect(thinkingDeltas).toEqual(["think", "ing"]);
    expect(textDeltas).toEqual(["ans", "wer"]);
    expect(doneResult).toEqual({ text: "answer", thinking: "thinking" });
  });

  it("returns early on abort without calling onError or onDone", async () => {
    const controller = new AbortController();
    const deltas: string[] = [];
    let done = false;
    let errored = false;

    const provider: LLMProvider = {
      id: "mock-abort",
      chat: () =>
        (async function* () {
          yield "a";
          controller.abort();
          yield "b";
        })(),
    };

    await runChat({
      provider,
      system: "sys",
      messages: [userMessage],
      signal: controller.signal,
      onDelta: (text) => deltas.push(text),
      onDone: () => {
        done = true;
      },
      onError: () => {
        errored = true;
      },
    });

    expect(deltas).toEqual(["a"]);
    expect(done).toBe(false);
    expect(errored).toBe(false);
  });

  it("calls onError when provider.chat throws", async () => {
    const error = new Error("chat failed");
    let caught: unknown;
    const provider: LLMProvider = {
      id: "mock-error",
      chat: () => {
        throw error;
      },
    };

    await runChat({
      provider,
      system: "sys",
      messages: [userMessage],
      signal: new AbortController().signal,
      onDelta: () => {},
      onDone: () => {
        throw new Error("onDone should not be called");
      },
      onError: (e) => {
        caught = e;
      },
    });

    expect(caught).toBe(error);
  });

  it("projects only text blocks and maps tool role to user", async () => {
    const chat = vi.fn((_opts: ChatOptions) => Promise.resolve("ok"));
    const provider: LLMProvider = { id: "mock-project", chat };
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "q" },
          { type: "thinking", text: "skip" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", text: "hidden" },
          { type: "text", text: "a" },
          { type: "tool_use", id: "t1", name: "search", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool_result", toolUseId: "t1", content: "ignored" },
          { type: "text", text: "r" },
        ],
      },
    ];

    await runChat({
      provider,
      system: "sys",
      messages,
      signal: new AbortController().signal,
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "q" },
          { role: "assistant", content: "a" },
          { role: "user", content: "r" },
        ],
      }),
    );
  });
});
