import { z } from "zod";
import type { Block } from "@/core/ir";
import { extractToc } from "@/core/toc/extractToc";
import type { AgentDeps, Tool } from "../types";

export const paperboxReadInputSchema = z.strictObject({
  mode: z.enum(["list", "paper"]),
  routeId: z.string().optional(),
  section: z
    .enum(["meta", "abstract", "outline", "full"])
    .default("meta"),
});

export type PaperboxReadInput = z.infer<typeof paperboxReadInputSchema>;

export type PaperboxListItem = {
  routeId: string;
  title: string;
  authors: string[];
  status: string;
};

export type PaperboxBlockSummary = {
  id: string;
  type: string;
  level?: number;
  content: string;
};

export type PaperboxReadOutput =
  | { mode: "list"; papers: PaperboxListItem[] }
  | {
      mode: "paper";
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
      mode: "paper";
      routeId: string;
      section: "abstract";
      blocks: PaperboxBlockSummary[];
    }
  | {
      mode: "paper";
      routeId: string;
      section: "outline";
      outline: Array<{ id: string; title: string; level: number }>;
    }
  | {
      mode: "paper";
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
  description: `Read papers from the current project's Paper Box (IndexedDB).

Use this tool to discover which papers are available and to fetch structured content before answering research questions.

Modes:
- list: Returns a compact catalog of all papers in the active project (title, authors, status, routeId). Use first when you need to know what is available or to pick a routeId.
- paper: Loads one paper by routeId (required). Combine with section to control how much content is returned.

Sections (only for mode=paper):
- meta (default): Bibliographic metadata and raw abstract HTML — lightweight overview.
- abstract: Structured abstractBlocks only.
- outline: Heading-only table of contents derived from body blocks.
- full: All abstractBlocks plus all body blocks (can be large; prefer abstract or outline when a quick scan suffices).

routeId examples: "2401.12345" (latest) or "2401.12345v2". Obtain routeId from list mode.`,
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

    if (input.mode === "list") {
      const entries = await deps.db.paperEntries
        .where("projectId")
        .equals(projectId)
        .toArray();
      entries.sort((a, b) => b.updatedAt - a.updatedAt);

      return {
        data: {
          mode: "list",
          papers: entries.map((entry) => ({
            routeId: entry.routeId,
            title: entry.title,
            authors: entry.authors,
            status: entry.status,
          })),
        },
      };
    }

    if (!input.routeId) {
      throw new Error('routeId is required when mode is "paper"');
    }

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
          mode: "paper",
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
          mode: "paper",
          routeId: input.routeId,
          section: "abstract",
          blocks: ir.abstractBlocks.map(summarizeBlock),
        },
      };
    }

    if (section === "outline") {
      return {
        data: {
          mode: "paper",
          routeId: input.routeId,
          section: "outline",
          outline: extractToc(ir),
        },
      };
    }

    return {
      data: {
        mode: "paper",
        routeId: input.routeId,
        section: "full",
        abstractBlocks: ir.abstractBlocks.map(summarizeBlock),
        blocks: ir.blocks.map(summarizeBlock),
      },
    };
  },
};
