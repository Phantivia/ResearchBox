import type { z } from "zod";
import type { Tool } from "../types";
import { subAgentTool } from "../subagent";
import { academicSearchTool } from "./academicSearch";
import { artifactsTool } from "./artifacts";
import { paperboxListTool } from "./paperboxList";
import { paperboxReadTool } from "./paperboxRead";
import { retrievalTool } from "./retrieval";
import { createWebSearchTool } from "./webSearch";
import { pythonTool } from "./python";
import { fetchResultTool } from "./fetchResult";

export { subAgentTool } from "../subagent";
export { academicSearchTool } from "./academicSearch";
export { artifactsTool } from "./artifacts";
export { paperboxListTool } from "./paperboxList";
export { paperboxReadTool } from "./paperboxRead";
export { pythonTool } from "./python";
export { retrievalTool } from "./retrieval";
export { createWebSearchTool, webSearchTool } from "./webSearch";
export { fetchResultTool } from "./fetchResult";

export function buildResearchTools(opts: {
  allowWeb: boolean;
  allowCode: boolean;
}): Tool<z.ZodTypeAny, unknown>[] {
  return [
    paperboxListTool,
    paperboxReadTool,
    fetchResultTool,
    retrievalTool,
    academicSearchTool,
    artifactsTool,
    subAgentTool,
    ...(opts.allowWeb ? [createWebSearchTool()] : []),
    ...(opts.allowCode ? [pythonTool] : []),
  ];
}
