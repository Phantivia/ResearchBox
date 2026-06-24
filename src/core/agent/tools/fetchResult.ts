import { z } from "zod";
import { getToolResult } from "@/db";
import type { Tool } from "../types";

export const fetchResultInputSchema = z.strictObject({
  resultId: z.string(),
});

export type FetchResultInput = z.infer<typeof fetchResultInputSchema>;

export type FetchResultOutput = {
  resultId: string;
  content: string;
};

export const fetchResultTool: Tool<
  typeof fetchResultInputSchema,
  FetchResultOutput
> = {
  name: "fetch_result",
  description: `Retrieve the full content of a large tool output that was persisted to IndexedDB.

When another tool returns a <persisted_output> preview with a resultId, call this tool to load the complete serialized result before analyzing it.

中文：按 resultId 取回因结果预算落库而截断的工具输出全文。只读、可并行。`,
  inputSchema: fetchResultInputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  call: async function* (_input, _deps) {
    yield { stage: "loading persisted result" };

    const row = await getToolResult(_input.resultId);
    if (!row) {
      throw new Error(`No persisted tool result found for resultId: ${_input.resultId}`);
    }

    return {
      data: {
        resultId: row.id,
        content: row.content,
      },
    };
  },
};
