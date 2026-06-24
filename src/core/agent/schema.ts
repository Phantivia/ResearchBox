import { z } from "zod";
import type { ToolSchema } from "@/core/llm/types";
import type { Tool } from "./types";

export function toToolSchema(tool: Tool<any, any>): ToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  };
}
