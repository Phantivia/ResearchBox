import type { z } from "zod";
import type { Tool } from "../types";
import { academicSearchTool } from "./academicSearch";
import { paperboxListTool } from "./paperboxList";
import { paperboxReadTool } from "./paperboxRead";
import { retrievalTool } from "./retrieval";

export { academicSearchTool } from "./academicSearch";
export { paperboxListTool } from "./paperboxList";
export { paperboxReadTool } from "./paperboxRead";
export { retrievalTool } from "./retrieval";

export function buildResearchTools(_opts: {
  allowWeb: boolean;
  allowCode: boolean;
}): Tool<z.ZodTypeAny, unknown>[] {
  return [
    paperboxListTool,
    paperboxReadTool,
    retrievalTool,
    academicSearchTool,
  ];
}
