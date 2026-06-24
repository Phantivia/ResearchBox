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
    "The user sees interactive cards and may click Include per paper; inclusion is the only legitimate entry for external literature.",
    "",
  ];

  for (const [index, paper] of papers.entries()) {
    lines.push(
      `${index + 1}. arxivId: ${paper.arxivId}`,
      `   Title: ${paper.title}`,
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
  description: `Present curated external paper recommendations to the user as interactive inclusion cards.

Use after academic_search or websearch when you have selected relevant papers worth importing. Provide arxivId, title, abstract, and a concise reason per paper. Supports batch input. Results are NOT automatically added to the Paper Box — the user decides via Include on each card.

Do NOT use this tool to dump raw search results; curate first. Only arXiv papers with arXiv HTML are importable today.`,
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
