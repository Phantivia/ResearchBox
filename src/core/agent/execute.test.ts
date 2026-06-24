import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { db, getToolResult } from "@/db";
import { executeBatched } from "./orchestrate";
import { executeTool } from "./execute";
import { MAX_RESULT_CHARS } from "./resultBudget";
import type { AgentDeps, AgentMessage, AgentStore, Tool } from "./types";
import type { LLMProvider } from "@/core/llm/types";

const inputSchema = z.object({ text: z.string() });

function makeStore(overrides: Partial<AgentStore> = {}): AgentStore {
  return {
    messages: [],
    pendingApprovals: [],
    runningTools: {},
    permissionMode: "default",
    append: () => {},
    enqueueApproval: () => {},
    setRunningTool: vi.fn(),
    clearRunningTool: vi.fn(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Omit<AgentDeps, "store">> & {
  permissionMode?: AgentStore["permissionMode"];
  store?: Partial<AgentStore>;
} = {}): AgentDeps {
  const { permissionMode, store: storeOverrides, ...rest } = overrides;
  const store = makeStore({
    ...(permissionMode !== undefined ? { permissionMode } : {}),
    ...storeOverrides,
  });
  return {
    db,
    llm: {
      id: "fake",
      chat: () => Promise.resolve(""),
    } as LLMProvider,
    store,
    signal: new AbortController().signal,
    requestApproval: async () => true,
    ...rest,
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

beforeEach(async () => {
  await db.toolResults.clear();
});

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

  it("returns small results unchanged", async () => {
    const small = "x".repeat(MAX_RESULT_CHARS);
    const tool = makeTool({
      name: "echo",
      call: async function* () {
        return { data: small };
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
      content: small,
    });
    expect(await db.toolResults.count()).toBe(0);
  });

  it("persists oversized results and returns preview with resultId", async () => {
    const large = "y".repeat(MAX_RESULT_CHARS + 1);
    const tool = makeTool({
      name: "echo",
      call: async function* () {
        return { data: large };
      },
    });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      makeDeps(),
    );

    const block = result.message.content[0];
    expect(block?.type).toBe("tool_result");
    if (block?.type !== "tool_result") {
      throw new Error("expected tool_result block");
    }
    expect(block.content).toContain("<persisted_output>");
    expect(block.content).toContain("fetch_result");
    expect(block.content).toContain("y".repeat(2000));

    const match = block.content.match(/resultId: ([0-9a-f-]{36})/i);
    expect(match).not.toBeNull();
    const stored = await getToolResult(match![1]!);
    expect(stored?.content).toBe(large);
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
    const deps = makeDeps();
    const { result, progress } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      deps,
    );

    expect(progress).toEqual([{ stage: "running" }]);
    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: JSON.stringify({ echoed: "hi" }),
    });
    expect(result.newMessages).toEqual([evidence]);
    expect(deps.store.setRunningTool).toHaveBeenCalledWith("t1", {
      name: "echo",
      stage: "running",
    });
    expect(deps.store.clearRunningTool).toHaveBeenCalledWith("t1");
  });

  it("returns isError tool_result when call throws", async () => {
    const deps = makeDeps();
    const tool = makeTool({
      name: "echo",
      call: async function* () {
        throw new Error("boom");
      },
    });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      deps,
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "工具执行失败: boom",
      isError: true,
    });
    expect(deps.store.clearRunningTool).toHaveBeenCalledWith("t1");
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
      makeDeps({ signal: controller.signal }),
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "工具执行被中止",
      isError: true,
    });
  });

  it("returns deny when checkPermissions asks and requestApproval rejects", async () => {
    const tool = makeTool({
      name: "echo",
      isReadOnly: () => false,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "需要审批",
        risk: "low",
      }),
      call: async function* () {
        return { data: "should not run" };
      },
    });
    const deps = makeDeps({ requestApproval: async () => false, permissionMode: "ask" });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      deps,
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "用户拒绝了工具审批",
      isError: true,
    });
    expect(result.denied).toBe("echo");
    expect(deps.store.setRunningTool).not.toHaveBeenCalled();
  });

  it("executes normally when checkPermissions asks and requestApproval approves", async () => {
    const tool = makeTool({
      name: "echo",
      isReadOnly: () => false,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "需要审批",
        risk: "low",
      }),
      call: async function* () {
        return { data: "ok" };
      },
    });
    const requestApproval = vi.fn(async () => true);
    const deps = makeDeps({ requestApproval, permissionMode: "ask" });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      deps,
    );

    expect(requestApproval).toHaveBeenCalledWith({
      tool: "echo",
      input: { text: "hi" },
      reason: "需要审批",
      risk: "low",
    });
    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "ok",
    });
    expect(result.denied).toBeUndefined();
  });

  it("auto-executes in default mode when checkPermissions asks without requestApproval", async () => {
    const tool = makeTool({
      name: "echo",
      isReadOnly: () => false,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "需要审批",
        risk: "low",
      }),
      call: async function* () {
        return { data: "ok" };
      },
    });
    const requestApproval = vi.fn(async () => false);
    const deps = makeDeps({ requestApproval, permissionMode: "default" });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "echo", input: { text: "hi" } },
      [tool],
      deps,
    );

    expect(requestApproval).not.toHaveBeenCalled();
    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "ok",
    });
    expect(result.denied).toBeUndefined();
  });

  it("denies write tools in ask mode when checkPermissions asks and approval rejected", async () => {
    const tool = makeTool({
      name: "writer",
      isReadOnly: () => false,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "write",
        risk: "high",
      }),
      call: async function* () {
        return { data: "should not run" };
      },
    });
    const requestApproval = vi.fn(async () => false);
    const deps = makeDeps({
      requestApproval,
      permissionMode: "ask",
    });
    const { result } = await drainExecuteTool(
      { id: "t1", name: "writer", input: { text: "hi" } },
      [tool],
      deps,
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "用户拒绝了工具审批",
      isError: true,
    });
    expect(result.denied).toBe("writer");
    expect(requestApproval).toHaveBeenCalled();
  });

  it("propagates denied through executeBatched when approval is rejected", async () => {
    const tool = makeTool({
      name: "echo",
      isReadOnly: () => false,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "需要审批",
        risk: "low",
      }),
      call: async function* () {
        return { data: "ok" };
      },
    });
    const deps = makeDeps({ requestApproval: async () => false, permissionMode: "ask" });
    const gen = executeBatched(
      [{ id: "t1", name: "echo", input: { text: "hi" } }],
      [tool],
      deps,
    );
    let step = await gen.next();
    while (!step.done) {
      step = await gen.next();
    }

    expect(step.value.denied).toBe("echo");
    expect(step.value.messages[0]?.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "用户拒绝了工具审批",
      isError: true,
    });
  });
});
