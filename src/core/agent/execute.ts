import { z } from "zod";
import { addToolResult } from "@/db";
import { resolvePermission } from "./approval";
import {
  buildLargeToolResultMessage,
  shouldPersistToolResult,
} from "./resultBudget";
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

async function buildDenialMessage(
  tool: Tool<z.ZodTypeAny, unknown>,
  input: z.infer<typeof tool.inputSchema>,
  deps: AgentDeps,
): Promise<string> {
  try {
    const perm = await tool.checkPermissions(input, deps);
    if (perm.behavior === "deny") {
      return perm.message;
    }
  } catch {
    // resolvePermission already fail-closed; message stays generic.
  }
  return "用户拒绝了工具审批";
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

  const decision = await resolvePermission({
    tool,
    input: parsed.data,
    deps,
    mode: deps.store.permissionMode,
  });
  if (decision === "deny") {
    return {
      message: toolResultMessage(
        call.id,
        await buildDenialMessage(tool, parsed.data, deps),
        true,
      ),
      newMessages: [],
      denied: tool.name,
    };
  }

  deps.store.setRunningTool(call.id, { name: tool.name, stage: "running" });
  try {
    const gen = tool.call(parsed.data, deps);
    let step = await gen.next();
    while (!step.done) {
      const progress = step.value as { stage?: string } | undefined;
      if (progress?.stage) {
        deps.store.setRunningTool(call.id, { name: tool.name, stage: progress.stage });
      }
      yield step.value;
      step = await gen.next();
    }

    const result = step.value;
    const serialized = serializeData(result.data);
    const content = shouldPersistToolResult(serialized)
        ? buildLargeToolResultMessage(
            serialized,
            await addToolResult({ content: serialized }),
          )
        : serialized;
    return {
      message: toolResultMessage(call.id, content),
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
  } finally {
    deps.store.clearRunningTool(call.id);
  }
}
