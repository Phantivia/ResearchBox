import { z } from "zod";
import type { Block } from "@/core/ir";
import { extractToc } from "@/core/toc/extractToc";
import type { AgentDeps, Tool } from "../types";

export const paperboxReadInputSchema = z.strictObject({
  routeId: z.string(),
  section: z
    .enum(["meta", "abstract", "outline", "full"])
    .default("meta"),
});

export type PaperboxReadInput = z.infer<typeof paperboxReadInputSchema>;

export type PaperboxBlockSummary = {
  id: string;
  type: string;
  level?: number;
  content: string;
};

export type PaperboxReadOutput =
  | {
      routeId: string;
      section: "meta";
      meta: {
        routeId: string;
        arxivId: string;
        version: string;
        title: string;
        authors: string[];
        status: string;
        abstract: string;
        modelUsed: string;
        createdAt: number;
      };
    }
  | {
      routeId: string;
      section: "abstract";
      blocks: PaperboxBlockSummary[];
    }
  | {
      routeId: string;
      section: "outline";
      outline: Array<{ id: string; title: string; level: number }>;
    }
  | {
      routeId: string;
      section: "full";
      abstractBlocks: PaperboxBlockSummary[];
      blocks: PaperboxBlockSummary[];
    };

function requireProjectId(deps: AgentDeps): string {
  if (!deps.projectId) {
    throw new Error("No active project: projectId was not provided in AgentDeps");
  }
  return deps.projectId;
}

function summarizeBlock(block: Block): PaperboxBlockSummary {
  return {
    id: block.id,
    type: block.type,
    ...(block.level !== undefined ? { level: block.level } : {}),
    content: block.content,
  };
}

export const paperboxReadTool: Tool<
  typeof paperboxReadInputSchema,
  PaperboxReadOutput
> = {
  name: "paperbox_read",
  description: `Read one paper from the current project's Paper Box (IndexedDB) in depth.

Use paperbox_list first to see what is in the box and pick a routeId. Then use this tool to fetch structured content for a single paper before answering research questions.

Sections:
- meta (default): Bibliographic metadata and raw abstract HTML — lightweight overview.
- abstract: Structured abstractBlocks only.
- outline: Heading-only table of contents derived from body blocks.
- full: All abstractBlocks plus all body blocks with raw HTML (large; prefer paperbox_fetch for full-text reading).

For full paper text with block markers and stripped HTML, use paperbox_fetch instead.

routeId examples: "2401.12345" (latest) or "2401.12345v2". Obtain routeId from paperbox_list.`,
  inputSchema: paperboxReadInputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  call: async function* (input, deps) {
    void deps.signal;
    yield { stage: "reading paper box" };

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

    const section = input.section;

    if (section === "meta") {
      return {
        data: {
          routeId: input.routeId,
          section: "meta",
          meta: {
            routeId: entry.routeId,
            arxivId: ir.arxivId,
            version: ir.version,
            title: ir.title,
            authors: ir.authors,
            status: entry.status,
            abstract: ir.abstract,
            modelUsed: ir.modelUsed,
            createdAt: ir.createdAt,
          },
        },
      };
    }

    if (section === "abstract") {
      return {
        data: {
          routeId: input.routeId,
          section: "abstract",
          blocks: ir.abstractBlocks.map(summarizeBlock),
        },
      };
    }

    if (section === "outline") {
      return {
        data: {
          routeId: input.routeId,
          section: "outline",
          outline: extractToc(ir),
        },
      };
    }

    return {
      data: {
        routeId: input.routeId,
        section: "full",
        abstractBlocks: ir.abstractBlocks.map(summarizeBlock),
        blocks: ir.blocks.map(summarizeBlock),
      },
    };
  },
};
