import type { z } from "zod";
import type { Tool } from "../types";
import { paperboxReadTool } from "./paperboxRead";

export { paperboxReadTool } from "./paperboxRead";

export function buildResearchTools(_opts: {
  allowWeb: boolean;
  allowCode: boolean;
}): Tool<z.ZodTypeAny, unknown>[] {
  return [paperboxReadTool];
}
