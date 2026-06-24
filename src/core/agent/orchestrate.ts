import { z } from "zod";
import { executeTool, type ExecuteToolResult, type ToolCall } from "./execute";
import type { AgentDeps, AgentMessage, Tool } from "./types";

export type Batch = {
  isConcurrencySafe: boolean;
  calls: ToolCall[];
};

export type BatchResult = {
  messages: AgentMessage[];
  denied?: string;
};

function isCallConcurrencySafe(
  call: ToolCall,
  tools: Tool<z.ZodTypeAny, unknown>[],
): boolean {
  try {
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) {
      return false;
    }
    const parsed = tool.inputSchema.safeParse(call.input);
    if (!parsed.success) {
      return false;
    }
    return tool.isConcurrencySafe(parsed.data) === true;
  } catch {
    return false;
  }
}

export function partitionToolCalls(
  calls: ToolCall[],
  tools: Tool<z.ZodTypeAny, unknown>[],
): Batch[] {
  const batches: Batch[] = [];

  for (const call of calls) {
    const safe = isCallConcurrencySafe(call, tools);
    const last = batches[batches.length - 1];

    if (safe && last?.isConcurrencySafe) {
      last.calls.push(call);
    } else {
      batches.push({ isConcurrencySafe: safe, calls: [call] });
    }
  }

  return batches;
}

async function drain<T>(
  gen: AsyncGenerator<unknown, T>,
): Promise<T> {
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index]!, index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function expandResults(results: ExecuteToolResult[]): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (const result of results) {
    messages.push(result.message);
    messages.push(...result.newMessages);
  }
  return messages;
}

export async function* executeBatched(
  calls: ToolCall[],
  tools: Tool<z.ZodTypeAny, unknown>[],
  deps: AgentDeps,
): AsyncGenerator<unknown, BatchResult> {
  const batches = partitionToolCalls(calls, tools);
  const orderedResults: ExecuteToolResult[] = [];
  let denied: string | undefined;

  for (const batch of batches) {
    let batchResults: ExecuteToolResult[];

    if (batch.isConcurrencySafe) {
      batchResults = await mapLimit(batch.calls, 4, (call) =>
        drain(executeTool(call, tools, deps)),
      );
    } else {
      batchResults = [];
      for (const call of batch.calls) {
        batchResults.push(await drain(executeTool(call, tools, deps)));
      }
    }

    for (const result of batchResults) {
      orderedResults.push(result);
      if (result.denied !== undefined && denied === undefined) {
        denied = result.denied;
      }
    }
  }

  return {
    messages: expandResults(orderedResults),
    denied,
  };
}
