import type { z } from "zod";
import type { Tool } from "../types";
import { academicSearchTool } from "./academicSearch";
import { artifactsTool } from "./artifacts";
import { paperboxListTool } from "./paperboxList";
import { paperboxReadTool } from "./paperboxRead";
import { retrievalTool } from "./retrieval";
import { createWebSearchTool } from "./webSearch";

export { academicSearchTool } from "./academicSearch";
export { artifactsTool } from "./artifacts";
export { paperboxListTool } from "./paperboxList";
export { paperboxReadTool } from "./paperboxRead";
export { retrievalTool } from "./retrieval";
export { createWebSearchTool, webSearchTool } from "./webSearch";

export function buildResearchTools(opts: {
  allowWeb: boolean;
  allowCode: boolean;
}): Tool<z.ZodTypeAny, unknown>[] {
  return [
    paperboxListTool,
    paperboxReadTool,
    retrievalTool,
    academicSearchTool,
    artifactsTool,
    ...(opts.allowWeb ? [createWebSearchTool()] : []),
  ];
}
