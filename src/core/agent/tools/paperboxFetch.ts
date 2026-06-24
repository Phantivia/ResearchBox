import { z } from "zod";
import { makePaperId } from "@/core/annotation";
import { formatCompactPaperText } from "../paperbox/compactPaperText";
import type { AgentDeps, Tool } from "../types";

export const paperboxFetchInputSchema = z.strictObject({
  routeId: z.string(),
});

export type PaperboxFetchInput = z.infer<typeof paperboxFetchInputSchema>;

export type PaperboxFetchOutput = string;

function requireProjectId(deps: AgentDeps): string {
  if (!deps.projectId) {
    throw new Error("No active project: projectId was not provided in AgentDeps");
  }
  return deps.projectId;
}

export const paperboxFetchTool: Tool<
  typeof paperboxFetchInputSchema,
  PaperboxFetchOutput
> = {
  name: "paperbox_fetch",
  description: `Fetch the full text of one paper from the current project's Paper Box as compact plain text. Each block is prefixed with a paperId#blockId marker; HTML and other non-semantic markup is stripped to save context.

Use paperbox_list to find routeId. Prefer this over paperbox_read(section=full) when you need the entire paper. For metadata, abstract structure, or outline only, use paperbox_read instead.

routeId examples: "2401.12345" (latest) or "2401.12345v2".`,
  inputSchema: paperboxFetchInputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  call: async function* (input, deps) {
    void deps.signal;
    yield { stage: "fetching paper full text" };

    const projectId = requireProjectId(deps);

    const entry = await deps.db.paperEntries.get([projectId, input.routeId]);
    if (!entry) {
      throw new Error(
        `Paper entry not found: projectId=${projectId}, routeId=${input.routeId}`,
      );
    }

    const ir = await deps.db.papers.get([entry.arxivId, entry.version]);
    if (!ir) {
      throw new Error(
        `Paper IR not found for arxivId=${entry.arxivId}, version=${entry.version}`,
      );
    }

    const paperId = makePaperId(entry.arxivId, entry.version);
    const text = formatCompactPaperText(ir, {
      paperId,
      routeId: input.routeId,
    });

    return { data: text };
  },
};
