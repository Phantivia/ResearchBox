import { z } from "zod";
import { makePaperId } from "@/core/annotation";
import type { Block, PaperIR } from "@/core/ir";
import { buildBlockCandidates } from "../retrieval/manifest";
import { selectRelevantBlocks } from "../retrieval/selectBlocks";
import { withProvenance } from "../provenance";
import type { AgentDeps, AgentMessage, Tool } from "../types";

export const retrievalInputSchema = z.strictObject({
  query: z.string(),
  paperIds: z.array(z.string()).optional(),
  topK: z.number().default(5),
});

export type RetrievalInput = z.infer<typeof retrievalInputSchema>;

export type RetrievalHit = {
  blockId: string;
  paperId: string;
  text: string;
  citation: string;
  staleDays: number;
};

const STALE_THRESHOLD_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function requireProjectId(deps: AgentDeps): string {
  if (!deps.projectId) {
    throw new Error("No active project: projectId was not provided in AgentDeps");
  }
  return deps.projectId;
}

function daysSince(timestamp: number, now = Date.now()): number {
  return Math.floor((now - timestamp) / MS_PER_DAY);
}

function memoryFreshnessText(staleDays: number): string {
  return `This paper record is ${staleDays} days old. It is a point-in-time snapshot, not live state — claims about paper content or paperId#blockId citations may be outdated. Verify against the current paper before asserting as fact.`;
}

function blockFullText(block: Block): string {
  if (block.caption) {
    return [block.content, block.caption].filter(Boolean).join("\n");
  }
  return block.content;
}

function parseCitationId(id: string): { paperId: string; blockId: string } | null {
  const hashIndex = id.lastIndexOf("#");
  if (hashIndex <= 0) {
    return null;
  }
  return {
    paperId: id.slice(0, hashIndex),
    blockId: id.slice(hashIndex + 1),
  };
}

function findBlock(paper: PaperIR, blockId: string): Block | undefined {
  return paper.blocks.find((block) => block.id === blockId);
}

async function loadProjectPapers(
  deps: AgentDeps,
  paperIds?: string[],
): Promise<{ papers: PaperIR[]; routeIdByPaperId: Map<string, string> }> {
  const projectId = requireProjectId(deps);
  const entries = await deps.db.paperEntries
    .where("projectId")
    .equals(projectId)
    .toArray();

  const filter = paperIds ? new Set(paperIds) : null;
  const papers: PaperIR[] = [];
  const routeIdByPaperId = new Map<string, string>();

  for (const entry of entries) {
    const paperId = makePaperId(entry.arxivId, entry.version);
    if (filter && !filter.has(paperId)) {
      continue;
    }

    const ir = await deps.db.papers.get([entry.arxivId, entry.version]);
    if (!ir) {
      continue;
    }

    papers.push(ir);
    routeIdByPaperId.set(paperId, entry.routeId);
  }

  return { papers, routeIdByPaperId };
}

function formatEvidenceMessage(
  hits: RetrievalHit[],
  routeIdByPaperId: Map<string, string>,
): string {
  const lines = [
    "Retrieval evidence from Paper Box:",
    "",
    "When citing claims from these blocks in your reply, you MUST use the exact `paperId#blockId` citation form shown below (mandatory, like file:line references).",
    "",
    "If you need full paper context for a hit, call paperbox_read(routeId) with section \"full\" (or abstract/outline when a lighter read suffices).",
  ];

  const routeHints = new Map<string, string>();
  for (const hit of hits) {
    const routeId = routeIdByPaperId.get(hit.paperId);
    if (routeId) {
      routeHints.set(hit.paperId, routeId);
    }
  }

  if (routeHints.size > 0) {
    lines.push("", "routeId reference for paperbox_read:");
    for (const [paperId, routeId] of routeHints) {
      lines.push(`- ${paperId} → routeId: ${routeId}`);
    }
  }

  for (const hit of hits) {
    lines.push("", `### ${hit.citation}`);
    if (hit.staleDays > STALE_THRESHOLD_DAYS) {
      lines.push(memoryFreshnessText(hit.staleDays));
    }
    lines.push(hit.text);
  }

  return lines.join("\n").trimEnd();
}

function evidenceMessage(hits: RetrievalHit[], routeIdByPaperId: Map<string, string>): AgentMessage {
  return {
    role: "user",
    uiHidden: true,
    content: [
      {
        type: "text",
        text: withProvenance("paperbox", formatEvidenceMessage(hits, routeIdByPaperId)),
      },
    ],
  };
}

export const retrievalTool: Tool<typeof retrievalInputSchema, RetrievalHit[]> = {
  name: "retrieval",
  description: `Search the local Paper Box for evidence blocks relevant to a query. Returns block-level hits with paperId#blockId citations for mandatory referencing in your answer.

Use paperbox_list first to see what is in the box. After retrieval, cite every paper claim as \`paperId#blockId\`. For full paper context on a hit, follow up with paperbox_read(routeId).

中文：从本地 PaperIR 库检索与 query 相关的证据区块，返回带 blockId 的定位引用。回答中涉及论文内容的论断必须带 paperId#blockId 引用；需要全文时用 paperbox_read 拉取。只读、可并行。`,
  inputSchema: retrievalInputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  call: async function* (input, deps) {
    yield { stage: "loading papers" };

    const { papers, routeIdByPaperId } = await loadProjectPapers(
      deps,
      input.paperIds,
    );
    const candidates = buildBlockCandidates(papers, {
      paperIds: input.paperIds,
    });

    yield { stage: "selecting relevant blocks" };

    const selectedIds = await selectRelevantBlocks({
      query: input.query,
      candidates,
      llm: deps.llm,
      topK: input.topK,
      signal: deps.signal,
    });

    const paperById = new Map(
      papers.map((paper) => [makePaperId(paper.arxivId, paper.version), paper]),
    );

    const hits: RetrievalHit[] = [];
    for (const id of selectedIds) {
      const parsed = parseCitationId(id);
      if (!parsed) {
        continue;
      }

      const paper = paperById.get(parsed.paperId);
      if (!paper) {
        continue;
      }

      const block = findBlock(paper, parsed.blockId);
      if (!block) {
        continue;
      }

      hits.push({
        blockId: parsed.blockId,
        paperId: parsed.paperId,
        citation: id,
        text: blockFullText(block),
        staleDays: daysSince(paper.createdAt),
      });
    }

    return {
      data: hits,
      newMessages: [evidenceMessage(hits, routeIdByPaperId)],
    };
  },
};
