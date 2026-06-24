import { z } from "zod";
import type { AssistantMessage, StreamEvent, ToolSchema } from "@/core/llm/types";
import { userMessageForLlm } from "./multimodal";
import type {
  AgentDeps,
  AgentMessage,
  ContentBlock,
  Terminal,
  Tool,
} from "./types";

const DEFAULT_MAX_TURNS = 30;
const MAX_CONSECUTIVE_TOOL_ERRORS = 3;

export type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

/** 工具批次执行结果，对应 BuildResearchAgent §7 executeBatched 的返回。 */
export type BatchResult = {
  /** 回灌主对话的工具结果消息，按提交序排列。 */
  messages: AgentMessage[];
  /** 若某工具被审批拒绝，记录其名称。 */
  denied?: string;
};

/**
 * 工具批次执行器签名（真实实现见 src/core/agent/orchestrate.ts）。
 * 以 AsyncGenerator 形式暴露：yield 出过程消息（如运行指示），return 出最终批次结果。
 */
export type BatchExecutor = (
  toolUses: ToolUseBlock[],
  tools: Tool<z.ZodTypeAny, unknown>[],
  deps: AgentDeps,
) => AsyncGenerator<AgentMessage, BatchResult>;

export type RunAgentParams = {
  messages: AgentMessage[];
  tools: Tool<z.ZodTypeAny, unknown>[];
  system: string;
  model?: string;
  maxTurns?: number;
  /** 流式增量回调；text/thinking 等过程事件经此暴露，不并入对话消息流。 */
  onEvent?: (event: StreamEvent) => void;
};

type AgentState = {
  turn: number;
  messages: AgentMessage[];
};

// orchestrate.ts 尚未就绪：默认执行器抛错，提示注入或实现真实 executeBatched。
// 待 orchestrate.ts 完成后，将此默认值替换为 `import { executeBatched }`。
const defaultExecutor: BatchExecutor = () => {
  throw new Error(
    "executeBatched 尚未实现：请实现 src/core/agent/orchestrate.ts 并注入，或在调用 runAgent 时传入 executor",
  );
};

function toToolSchema(tool: Tool<z.ZodTypeAny, unknown>): ToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  };
}

function isToolUse(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function messagesForLlm(messages: AgentMessage[]): AgentMessage[] {
  return messages
    .filter((message) => !message.llmHidden)
    .map(userMessageForLlm);
}

/**
 * 断路器：统计「同一工具连续失败」次数。成功则清零，达到上限返回触发工具名。
 * 跨轮累计（streak 在 runAgent 内贯穿整个循环）。
 */
function updateErrorStreak(
  streak: Map<string, number>,
  toolUses: ToolUseBlock[],
  messages: AgentMessage[],
): string | undefined {
  const idToName = new Map<string, string>();
  for (const use of toolUses) {
    idToName.set(use.id, use.name);
  }

  let tripped: string | undefined;
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== "tool_result") continue;
      const name = idToName.get(block.toolUseId);
      if (!name) continue;
      if (block.isError) {
        const count = (streak.get(name) ?? 0) + 1;
        streak.set(name, count);
        if (count >= MAX_CONSECUTIVE_TOOL_ERRORS) {
          tripped = name;
        }
      } else {
        streak.set(name, 0);
      }
    }
  }
  return tripped;
}

export async function* runAgent(
  params: RunAgentParams,
  deps: AgentDeps,
  executor: BatchExecutor = defaultExecutor,
): AsyncGenerator<AgentMessage, Terminal> {
  const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS;
  const toolSchemas = params.tools.map(toToolSchema);
  const errorStreak = new Map<string, number>();

  let state: AgentState = { turn: 0, messages: params.messages };

  while (true) {
    if (deps.signal.aborted) {
      return { reason: "aborted" };
    }
    if (state.turn >= maxTurns) {
      return { reason: "max_turns" };
    }

    const runWithTools = deps.llm.runWithTools?.bind(deps.llm);
    if (!runWithTools) {
      return {
        reason: "model_error",
        error: new Error("provider 不支持工具调用"),
      };
    }

    let assistant: AssistantMessage;
    try {
      const stream = runWithTools({
        messages: messagesForLlm(state.messages),
        tools: toolSchemas,
        system: params.system,
        model: params.model,
        signal: deps.signal,
      });
      let next = await stream.next();
      while (!next.done) {
        params.onEvent?.(next.value);
        next = await stream.next();
      }
      assistant = next.value;
    } catch (error) {
      return { reason: "model_error", error };
    }

    const assistantMessage: AgentMessage = {
      role: "assistant",
      content: assistant.content,
    };
    yield assistantMessage;

    const toolUses = assistant.content.filter(isToolUse);
    if (toolUses.length === 0) {
      return { reason: "completed" };
    }

    const batchExec = executor(toolUses, params.tools, deps);
    let step = await batchExec.next();
    while (!step.done) {
      yield step.value;
      step = await batchExec.next();
    }
    const batch = step.value;

    for (const message of batch.messages) {
      yield message;
    }

    if (batch.denied !== undefined) {
      return { reason: "approval_denied", toolName: batch.denied };
    }

    const tripped = updateErrorStreak(errorStreak, toolUses, batch.messages);
    if (tripped) {
      return {
        reason: "model_error",
        error: new Error(
          `工具 ${tripped} 连续失败 ${MAX_CONSECUTIVE_TOOL_ERRORS} 次，触发断路器`,
        ),
      };
    }

    state = {
      turn: state.turn + 1,
      messages: [...state.messages, assistantMessage, ...batch.messages],
    };
  }
}
