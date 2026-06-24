import type { z } from "zod";
import type { Tool } from "../types";
import { paperboxListTool } from "./paperboxList";
import { paperboxReadTool } from "./paperboxRead";
import { retrievalTool } from "./retrieval";

export { paperboxListTool } from "./paperboxList";
export { paperboxReadTool } from "./paperboxRead";
export { retrievalTool } from "./retrieval";

export function buildResearchTools(_opts: {
  allowWeb: boolean;
  allowCode: boolean;
}): Tool<z.ZodTypeAny, unknown>[] {
  return [paperboxListTool, paperboxReadTool, retrievalTool];
}
