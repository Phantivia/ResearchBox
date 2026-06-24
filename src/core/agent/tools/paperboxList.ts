import { z } from "zod";
import { withProvenance } from "../provenance";
import type { AgentDeps, AgentMessage, Tool } from "../types";

export const paperboxListInputSchema = z.strictObject({});

export type PaperboxListInput = z.infer<typeof paperboxListInputSchema>;

export type PaperboxListItem = {
  routeId: string;
  title: string;
  authors: string[];
  abstract: string;
  status: string;
};

export type PaperboxListOutput = {
  papers: PaperboxListItem[];
};

function requireProjectId(deps: AgentDeps): string {
  if (!deps.projectId) {
    throw new Error("No active project: projectId was not provided in AgentDeps");
  }
  return deps.projectId;
}

function formatPaperCatalog(papers: PaperboxListItem[]): string {
  if (papers.length === 0) {
    return "Paper Box is empty — no papers in the active project.";
  }

  const lines = [`Paper Box catalog (${papers.length} papers):`, ""];
  for (const [index, paper] of papers.entries()) {
    lines.push(
      `${index + 1}. routeId: ${paper.routeId}`,
      `   Title: ${paper.title}`,
      `   Authors: ${paper.authors.join(", ") || "(none)"}`,
      `   Status: ${paper.status}`,
      `   Abstract: ${paper.abstract || "(empty — IR missing or no abstract)"}`,
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

function catalogMessage(papers: PaperboxListItem[]): AgentMessage {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: withProvenance("paperbox", formatPaperCatalog(papers)),
      },
    ],
  };
}

export const paperboxListTool: Tool<
  typeof paperboxListInputSchema,
  PaperboxListOutput
> = {
  name: "paperbox_list",
  description: `List all papers in the current project's Paper Box with title, authors, and abstract.

Use this before retrieval or external search to see what is already in the box, whether you need outside sources, and which papers deserve deeper inspection (paperbox_read or retrieval).

中文：列出盒内全部论文的标题、作者与摘要。检索或外搜前先用它判断盒里已有什么、是否需要外部检索、该对哪几篇做深度检索。只读、可并行、低成本。`,
  inputSchema: paperboxListInputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  call: async function* (input, deps) {
    void input;
    void deps.signal;
    yield { stage: "listing paper box" };

    const projectId = requireProjectId(deps);

    const entries = await deps.db.paperEntries
      .where("projectId")
      .equals(projectId)
      .toArray();
    entries.sort((a, b) => b.updatedAt - a.updatedAt);

    const papers: PaperboxListItem[] = await Promise.all(
      entries.map(async (entry) => {
        const ir = await deps.db.papers.get([entry.arxivId, entry.version]);
        return {
          routeId: entry.routeId,
          title: entry.title,
          authors: entry.authors,
          abstract: ir?.abstract ?? "",
          status: entry.status,
        };
      }),
    );

    return {
      data: { papers },
      newMessages: [catalogMessage(papers)],
    };
  },
};
