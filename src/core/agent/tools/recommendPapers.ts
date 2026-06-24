import { parseArxivId } from "@/core/fetcher";
import { withProvenance } from "../provenance";
import {
  type PaperRecommendation,
  recommendPapersInputSchema,
} from "../recommendation/types";
import type { AgentMessage, Tool } from "../types";

function normalizeRecommendations(
  papers: PaperRecommendation[],
): PaperRecommendation[] {
  return papers.map((paper) => {
    const parsed = parseArxivId(paper.arxivId);
    return {
      ...paper,
      arxivId: parsed ? (parsed.version ? `${parsed.id}${parsed.version}` : parsed.id) : paper.arxivId.trim(),
    };
  });
}

function formatRecommendationsMessage(papers: PaperRecommendation[]): string {
  const lines = [
    `Presented ${papers.length} paper recommendation(s) to the user for optional inclusion into the Paper Box.`,
    "The user sees interactive cards and may click 「纳入」 per paper; inclusion is the only legitimate entry for external literature.",
    "",
  ];

  for (const [index, paper] of papers.entries()) {
    lines.push(
      `${index + 1}. arxivId: ${paper.arxivId}`,
      `   Reason: ${paper.reason}`,
      `   Abstract: ${paper.abstract || "(empty)"}`,
      "",
    );
  }

  return withProvenance("academic", lines.join("\n").trimEnd());
}

function recommendationsMessage(papers: PaperRecommendation[]): AgentMessage {
  return {
    role: "user",
    uiHidden: true,
    content: [{ type: "text", text: formatRecommendationsMessage(papers) }],
  };
}

export const recommendPapersTool: Tool<
  typeof recommendPapersInputSchema,
  PaperRecommendation[]
> = {
  name: "recommend_papers",
  description: `Present curated external paper recommendations to the user as interactive inclusion cards (引入论文推荐).

Use after academic_search or websearch when you have selected relevant papers worth importing. Provide arxivId, abstract, and a concise reason per paper. Supports batch input. Results are NOT automatically added to the Paper Box — the user decides via 「纳入」 on each card.

Do NOT use this tool to dump raw search results; curate first. Only arXiv papers with arXiv HTML are importable today.

中文：向用户展示精选的外部论文推荐卡片（引入论文推荐）。在 academic_search / websearch 后，对值得纳入的文献调用本工具，填写 arxivId、abstract 与推荐理由，可批量。不自动进盒，用户逐篇点「纳入」。勿把未筛选的搜索结果直接塞入；当前仅支持有 arXiv HTML 的 arXiv 论文。`,
  inputSchema: recommendPapersInputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  call: async function* (input, _deps) {
    yield { stage: "preparing recommendations" };

    const papers = normalizeRecommendations(input.papers);
    const invalid = papers.filter((paper) => !parseArxivId(paper.arxivId));
    if (invalid.length > 0) {
      const ids = invalid.map((paper) => paper.arxivId).join(", ");
      throw new Error(`Invalid arXiv ID(s): ${ids}`);
    }

    return {
      data: papers,
      newMessages: [recommendationsMessage(papers)],
    };
  },
};
