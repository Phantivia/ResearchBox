import { z } from "zod";
import type { AgentDeps, AgentMessage, Tool } from "./types";

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ExecuteToolResult = {
  message: AgentMessage;
  newMessages: AgentMessage[];
  denied?: string;
};

function serializeData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

function toolResultMessage(
  toolUseId: string,
  content: string,
  isError = false,
): AgentMessage {
  return {
    role: "tool",
    content: [
      isError
        ? { type: "tool_result", toolUseId, content, isError: true }
        : { type: "tool_result", toolUseId, content },
    ],
  };
}

function classifyCallError(error: unknown, signal: AbortSignal): string {
  if (
    signal.aborted ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return "工具执行被中止";
  }
  if (error instanceof Error) {
    return `工具执行失败: ${error.message}`;
  }
  return `工具执行失败: ${String(error)}`;
}

export async function* executeTool(
  call: ToolCall,
  tools: Tool<z.ZodTypeAny, unknown>[],
  deps: AgentDeps,
): AsyncGenerator<unknown, ExecuteToolResult> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return {
      message: toolResultMessage(call.id, `未知工具: ${call.name}`, true),
      newMessages: [],
    };
  }

  const parsed = tool.inputSchema.safeParse(call.input);
  if (!parsed.success) {
    return {
      message: toolResultMessage(
        call.id,
        `输入校验失败: ${formatZodError(parsed.error)}`,
        true,
      ),
      newMessages: [],
    };
  }

  const perm = await tool.checkPermissions(parsed.data, deps);
  if (perm.behavior === "deny") {
    return {
      message: toolResultMessage(call.id, perm.message, true),
      newMessages: [],
      denied: tool.name,
    };
  }

  const askNote =
    perm.behavior === "ask" ? "[将来需审批] " : "";

  try {
    const gen = tool.call(parsed.data, deps);
    let step = await gen.next();
    while (!step.done) {
      yield step.value;
      step = await gen.next();
    }

    const result = step.value;
    return {
      message: toolResultMessage(
        call.id,
        `${askNote}${serializeData(result.data)}`,
      ),
      newMessages: result.newMessages ?? [],
    };
  } catch (error) {
    return {
      message: toolResultMessage(
        call.id,
        classifyCallError(error, deps.signal),
        true,
      ),
      newMessages: [],
    };
  }
}
