import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runAgent, type BatchExecutor, type BatchResult } from "./loop";
import type { AgentDeps, AgentMessage, Terminal, Tool } from "./types";
import type { AssistantMessage, LLMProvider } from "@/core/llm/types";

const user = (text: string): AgentMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

const echoTool: Tool<z.ZodTypeAny, unknown> = {
  name: "echo",
  description: "echo back the input",
  inputSchema: z.object({ text: z.string() }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: async () => ({ behavior: "allow", updatedInput: undefined }),
  call: async function* () {
    return { data: null };
  },
};

function scriptedLLM(replies: AssistantMessage[]) {
  const calls: { messages: AgentMessage[] }[] = [];
  const runWithTools: LLMProvider["runWithTools"] = async function* (req) {
    calls.push({ messages: req.messages });
    const reply = replies[calls.length - 1] ?? replies[replies.length - 1];
    if (!reply) {
      throw new Error("scriptedLLM: no reply configured");
    }
    return reply;
  };
  return { runWithTools, calls };
}

function makeDeps(
  runWithTools: LLMProvider["runWithTools"],
  signal?: AbortSignal,
): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
    llm: {
      id: "fake",
      chat: () => Promise.resolve(""),
      runWithTools,
    },
    store: {} as AgentDeps["store"],
    signal: signal ?? new AbortController().signal,
    requestApproval: async () => true,
  };
}

async function drain(
  gen: AsyncGenerator<AgentMessage, Terminal>,
): Promise<{ messages: AgentMessage[]; terminal: Terminal }> {
  const messages: AgentMessage[] = [];
  let result = await gen.next();
  while (!result.done) {
    messages.push(result.value);
    result = await gen.next();
  }
  return { messages, terminal: result.value };
}

const toolUseReply = (id: string): AssistantMessage => ({
  content: [{ type: "tool_use", id, name: "echo", input: { text: "hi" } }],
  stopReason: "tool_use",
});

const textReply = (text: string): AssistantMessage => ({
  content: [{ type: "text", text }],
  stopReason: "end_turn",
});

const toolResultMessage = (
  toolUseId: string,
  content: string,
  isError = false,
): AgentMessage => ({
  role: "tool",
  content: [{ type: "tool_result", toolUseId, content, isError }],
});

describe("runAgent", () => {
  it("terminates with completed when the model emits no tool_use", async () => {
    const { runWithTools } = scriptedLLM([textReply("done")]);
    const deps = makeDeps(runWithTools);
    let executorCalled = false;
    const executor: BatchExecutor = async function* () {
      executorCalled = true;
      return { messages: [] };
    };

    const { messages, terminal } = await drain(
      runAgent({ messages: [user("hi")], tools: [], system: "sys" }, deps, executor),
    );

    expect(terminal).toEqual({ reason: "completed" });
    expect(messages).toEqual([
      { role: "assistant", content: [{ type: "text", text: "done" }] },
    ]);
    expect(executorCalled).toBe(false);
  });

  it("runs one tool round then completes, advancing turns and rebuilding messages", async () => {
    const { runWithTools, calls } = scriptedLLM([
      toolUseReply("t1"),
      textReply("all done"),
    ]);
    const deps = makeDeps(runWithTools);
    const toolResult = toolResultMessage("t1", "hi");
    const executor: BatchExecutor = async function* () {
      return { messages: [toolResult] };
    };

    const { messages, terminal } = await drain(
      runAgent(
        { messages: [user("hi")], tools: [echoTool], system: "sys" },
        deps,
        executor,
      ),
    );

    expect(terminal).toEqual({ reason: "completed" });
    expect(messages).toEqual([
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "echo", input: { text: "hi" } }],
      },
      toolResult,
      { role: "assistant", content: [{ type: "text", text: "all done" }] },
    ]);

    // turn 递增 + 全量重建 state.messages：第二轮模型收到 [user, assistant, toolResult]
    expect(calls).toHaveLength(2);
    expect(calls[0]?.messages.map((m) => m.role)).toEqual(["user"]);
    expect(calls[1]?.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
  });

  it("stops with max_turns when the model never finishes", async () => {
    const { runWithTools, calls } = scriptedLLM([toolUseReply("t")]);
    const deps = makeDeps(runWithTools);
    const executor: BatchExecutor = async function* () {
      return { messages: [toolResultMessage("t", "ok")] };
    };

    const { terminal } = await drain(
      runAgent(
        { messages: [user("hi")], tools: [echoTool], system: "sys", maxTurns: 2 },
        deps,
        executor,
      ),
    );

    expect(terminal).toEqual({ reason: "max_turns" });
    expect(calls).toHaveLength(2);
  });

  it("returns aborted immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { runWithTools, calls } = scriptedLLM([textReply("never")]);
    const deps = makeDeps(runWithTools, controller.signal);
    const executor: BatchExecutor = async function* () {
      return { messages: [] };
    };

    const { messages, terminal } = await drain(
      runAgent({ messages: [user("hi")], tools: [], system: "sys" }, deps, executor),
    );

    expect(terminal).toEqual({ reason: "aborted" });
    expect(messages).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("returns approval_denied when the executor reports a denied tool", async () => {
    const { runWithTools } = scriptedLLM([toolUseReply("t1")]);
    const deps = makeDeps(runWithTools);
    const deniedResult = toolResultMessage("t1", "用户拒绝", true);
    const executor: BatchExecutor = async function* () {
      return { messages: [deniedResult], denied: "echo" };
    };

    const { messages, terminal } = await drain(
      runAgent(
        { messages: [user("hi")], tools: [echoTool], system: "sys" },
        deps,
        executor,
      ),
    );

    expect(terminal).toEqual({ reason: "approval_denied", toolName: "echo" });
    expect(messages).toEqual([
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "echo", input: { text: "hi" } }],
      },
      deniedResult,
    ]);
  });

  it("returns model_error when the provider lacks runWithTools", async () => {
    const deps = makeDeps(undefined);
    const { terminal } = await drain(
      runAgent({ messages: [user("hi")], tools: [], system: "sys" }, deps),
    );

    expect(terminal.reason).toBe("model_error");
    if (terminal.reason === "model_error") {
      expect((terminal.error as Error).message).toBe("provider 不支持工具调用");
    }
  });

  it("trips the circuit breaker after consecutive tool failures", async () => {
    const { runWithTools, calls } = scriptedLLM([toolUseReply("t")]);
    const deps = makeDeps(runWithTools);
    const executor: BatchExecutor = async function* (): AsyncGenerator<
      AgentMessage,
      BatchResult
    > {
      return { messages: [toolResultMessage("t", "boom", true)] };
    };

    const { terminal } = await drain(
      runAgent(
        { messages: [user("hi")], tools: [echoTool], system: "sys" },
        deps,
        executor,
      ),
    );

    expect(terminal.reason).toBe("model_error");
    // 第 3 次失败触发断路器：模型恰好被调用 3 次。
    expect(calls).toHaveLength(3);
  });
});
