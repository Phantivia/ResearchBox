import { describe, it, expect } from "vitest";
import { z } from "zod";
import { executeBatched, partitionToolCalls } from "./orchestrate";
import type { AgentDeps, Tool } from "./types";
import type { LLMProvider } from "@/core/llm/types";

const delaySchema = z.object({ delayMs: z.number(), label: z.string() });

function makeDeps(): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
    llm: {
      id: "fake",
      chat: () => Promise.resolve(""),
    } as LLMProvider,
    store: {
      messages: [],
      pendingApprovals: [],
      runningTools: {},
      permissionMode: "default",
      append: () => {},
      enqueueApproval: () => {},
      setRunningTool: () => {},
      clearRunningTool: () => {},
    },
    signal: new AbortController().signal,
    requestApproval: async () => true,
  };
}

function makeSafeTool(name: string): Tool<typeof delaySchema, string> {
  return {
    name,
    description: "safe tool",
    inputSchema: delaySchema,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    checkPermissions: async () => ({ behavior: "allow", updatedInput: undefined }),
    async *call(input) {
      await new Promise((resolve) => setTimeout(resolve, input.delayMs));
      return { data: input.label };
    },
  };
}

function makeUnsafeTool(name: string): Tool<typeof delaySchema, string> {
  return {
    name,
    description: "unsafe tool",
    inputSchema: delaySchema,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    checkPermissions: async () => ({ behavior: "allow", updatedInput: undefined }),
    async *call(input) {
      return { data: input.label };
    },
  };
}

async function drainExecuteBatched(
  calls: { id: string; name: string; input: unknown }[],
  tools: Tool<z.ZodTypeAny, unknown>[],
  deps: AgentDeps,
) {
  const gen = executeBatched(calls, tools, deps);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

function toolUseIds(messages: { content: { toolUseId?: string; type: string }[] }[]) {
  return messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === "tool_result")
    .map((block) => block.toolUseId);
}

describe("partitionToolCalls", () => {
  it("merges three consecutive safe tools into one concurrent batch", () => {
    const tools = [
      makeSafeTool("safe_a"),
      makeSafeTool("safe_b"),
      makeSafeTool("safe_c"),
    ];
    const calls = [
      { id: "1", name: "safe_a", input: { delayMs: 0, label: "a" } },
      { id: "2", name: "safe_b", input: { delayMs: 0, label: "b" } },
      { id: "3", name: "safe_c", input: { delayMs: 0, label: "c" } },
    ];

    const batches = partitionToolCalls(calls, tools);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.isConcurrencySafe).toBe(true);
    expect(batches[0]?.calls).toHaveLength(3);
    expect(batches[0]?.calls.map((call) => call.id)).toEqual(["1", "2", "3"]);
  });

  it("splits safe, unsafe, safe into three batches preserving order", () => {
    const tools = [
      makeSafeTool("safe"),
      makeUnsafeTool("unsafe"),
      makeSafeTool("safe"),
    ];
    const calls = [
      { id: "1", name: "safe", input: { delayMs: 0, label: "a" } },
      { id: "2", name: "unsafe", input: { delayMs: 0, label: "b" } },
      { id: "3", name: "safe", input: { delayMs: 0, label: "c" } },
    ];

    const batches = partitionToolCalls(calls, tools);

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.isConcurrencySafe)).toEqual([
      true,
      false,
      true,
    ]);
    expect(batches.flatMap((batch) => batch.calls.map((call) => call.id))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("treats unknown tools as unsafe (fail-closed)", () => {
    const tools = [makeSafeTool("safe")];
    const calls = [
      { id: "1", name: "safe", input: { delayMs: 0, label: "a" } },
      { id: "2", name: "missing", input: {} },
      { id: "3", name: "safe", input: { delayMs: 0, label: "c" } },
    ];

    const batches = partitionToolCalls(calls, tools);

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.isConcurrencySafe)).toEqual([
      true,
      false,
      true,
    ]);
  });
});

describe("executeBatched", () => {
  it("returns concurrent batch results in submission order despite different delays", async () => {
    const tool = makeSafeTool("delay");
    const calls = [
      { id: "slow", name: "delay", input: { delayMs: 50, label: "first" } },
      { id: "mid", name: "delay", input: { delayMs: 20, label: "second" } },
      { id: "fast", name: "delay", input: { delayMs: 5, label: "third" } },
    ];

    const result = await drainExecuteBatched(calls, [tool], makeDeps());

    expect(toolUseIds(result.messages)).toEqual(["slow", "mid", "fast"]);
    expect(
      result.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === "tool_result")
        .map((block) => (block.type === "tool_result" ? block.content : "")),
    ).toEqual(["first", "second", "third"]);
  });

  it("records denied when any tool result is denied", async () => {
    const denyTool: Tool<typeof delaySchema, string> = {
      ...makeSafeTool("deny_me"),
      checkPermissions: async () => ({
        behavior: "deny",
        message: "blocked",
      }),
    };
    const calls = [
      { id: "1", name: "deny_me", input: { delayMs: 0, label: "a" } },
      { id: "2", name: "deny_me", input: { delayMs: 0, label: "b" } },
    ];

    const result = await drainExecuteBatched(calls, [denyTool], makeDeps());

    expect(result.denied).toBe("deny_me");
    expect(toolUseIds(result.messages)).toEqual(["1", "2"]);
  });
});
