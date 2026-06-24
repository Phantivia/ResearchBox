import { describe, it, expect } from "vitest";
import { z } from "zod";
import { executeTool } from "./execute";
import type { AgentDeps, AgentMessage, Tool } from "./types";
import type { LLMProvider } from "@/core/llm/types";

const inputSchema = z.object({ text: z.string() });

function makeDeps(signal?: AbortSignal): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
    llm: {
      id: "fake",
      chat: () => Promise.resolve(""),
    } as LLMProvider,
    store: {} as AgentDeps["store"],
    signal: signal ?? new AbortController().signal,
    requestApproval: async () => true,
  };
}

function makeTool(
  overrides: Partial<Tool<typeof inputSchema, unknown>> & {
    name: string;
  },
): Tool<typeof inputSchema, unknown> {
  return {
    description: "test tool",
    inputSchema,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    checkPermissions: async () => ({ behavior: "allow", updatedInput: undefined }),
    call: async function* () {
      return { data: null };
    },
    ...overrides,
  };
}

async function drainExecuteTool(
  call: { id: string; name: string; input: unknown },
  tools: Tool<z.ZodTypeAny, unknown>[],
  deps: AgentDeps,
) {
  const gen = executeTool(call, tools, deps);
  let step = await gen.next();
  const progress: unknown[] = [];
  while (!step.done) {
    progress.push(step.value);
    step = await gen.next();
  }
  return { result: step.value, progress };
}

describe("executeTool", () => {
  it("returns isError tool_result for unknown tool", async () => {
    const { result } = await drainExecuteTool(
      { id: "t1", name: "missing", input: {} },
      [],
      makeDeps(),
    );

    expect(result.message.role).toBe("tool");
    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "未知工具: missing",
      isError: true,
    });
    expect(result.newMessages).toEqual([]);
    expect(result.denied).toBeUndefined();
  });

  it("returns isError tool_result when zod validation fails", async () => {
    const tool = makeTool({ name: "echo" });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: 123 } },
      [tool],
      makeDeps(),
    );

    const block = result.message.content[0];
    expect(block).toMatchObject({
      type: "tool_result",
      toolUseId: "t1",
      isError: true,
    });
    expect(block?.type).toBe("tool_result");
    if (block?.type === "tool_result") {
      expect(block.content).toContain("输入校验失败");
      expect(block.content).toContain("text");
    }
  });

  it("returns isError tool_result and denied when permission is deny", async () => {
    const tool = makeTool({
      name: "echo",
      checkPermissions: async () => ({
        behavior: "deny",
        message: "不允许执行",
      }),
    });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      makeDeps(),
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "不允许执行",
      isError: true,
    });
    expect(result.denied).toBe("echo");
  });

  it("returns serialized data and forwards newMessages on successful call", async () => {
    const evidence: AgentMessage = {
      role: "user",
      content: [{ type: "text", text: "evidence" }],
    };
    const tool = makeTool({
      name: "echo",
      call: async function* (_input, _deps) {
        yield { stage: "running" };
        return {
          data: { echoed: "hi" },
          newMessages: [evidence],
        };
      },
    });
    const { result, progress } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      makeDeps(),
    );

    expect(progress).toEqual([{ stage: "running" }]);
    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: JSON.stringify({ echoed: "hi" }),
    });
    expect(result.newMessages).toEqual([evidence]);
  });

  it("returns isError tool_result when call throws", async () => {
    const tool = makeTool({
      name: "echo",
      call: async function* () {
        throw new Error("boom");
      },
    });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      makeDeps(),
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "工具执行失败: boom",
      isError: true,
    });
  });

  it("classifies abort errors when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const tool = makeTool({
      name: "echo",
      call: async function* () {
        throw new DOMException("Aborted", "AbortError");
      },
    });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      makeDeps(controller.signal),
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "工具执行被中止",
      isError: true,
    });
  });

  it("continues execution for ask permission and annotates result content", async () => {
    const tool = makeTool({
      name: "echo",
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "需要审批",
        risk: "low",
      }),
      call: async function* () {
        return { data: "ok" };
      },
    });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      makeDeps(),
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "[将来需审批] ok",
    });
    expect(result.denied).toBeUndefined();
  });
});
