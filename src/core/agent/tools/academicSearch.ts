import { z } from "zod";
import { getSettings } from "@/db";
import { withProvenance } from "../provenance";
import { runAcademicSearch } from "../search/runAcademicSearch";
import type { AcademicHit } from "../search/types";
import type { AgentMessage, Tool } from "../types";

export const academicSearchInputSchema = z.strictObject({
  query: z.string(),
  limit: z.number().default(10),
});

export type AcademicSearchInput = z.infer<typeof academicSearchInputSchema>;

function formatHitCatalog(hits: AcademicHit[], query: string): string {
  const agentNotice =
    "These results are for your analysis only — they are NOT shown to the user as cards. After curating relevant hits, call recommend_papers with arxivId, abstract, and reason so the user can choose which papers to include.";

  if (hits.length === 0) {
    return [`Academic search for "${query}" returned no hits.`, "", agentNotice].join("\n");
  }

  const lines = [
    `Academic search results for "${query}" (${hits.length} hits):`,
    "",
    agentNotice,
    "",
  ];

  for (const [index, hit] of hits.entries()) {
    lines.push(
      `${index + 1}. arxivId: ${hit.arxivId}`,
      `   Title: ${hit.title}`,
      `   Authors: ${hit.authors.join(", ") || "(none)"}`,
      `   Abstract: ${hit.abstract || "(empty)"}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

function catalogMessage(hits: AcademicHit[], query: string): AgentMessage {
  return {
    role: "user",
    uiHidden: true,
    content: [
      {
        type: "text",
        text: withProvenance("academic", formatHitCatalog(hits, query)),
      },
    ],
  };
}

export const academicSearchTool: Tool<
  typeof academicSearchInputSchema,
  AcademicHit[]
> = {
  name: "academic_search",
  description: `Search external academic literature (Semantic Scholar / OpenAlex, arXiv-centric). Returns arxivId, title, authors, and abstract for each hit. Read-only, network access; results are for agent analysis only — NOT shown to the user as inclusion cards.

After curating relevant hits, call recommend_papers (引入论文推荐) with arxivId, abstract, and reason so the user can review and click 「纳入」 per paper. Inclusion is the only legitimate entry for external literature into the Paper Box.

Note (implementation): import currently supports arXiv papers with arXiv HTML only.

中文：外部学术文献搜索（Semantic Scholar / OpenAlex，以 arXiv 为中心），返回 arxivId、标题、作者与摘要。只读、联网；结果仅供 agent 分析，**不以卡片形式展示给用户**。

筛选相关文献后，请调用 recommend_papers（引入论文推荐），填写 arxivId、abstract 与推荐理由，由用户逐篇点「纳入」进盒。

注释：当前纳入仅支持有 arXiv HTML 的 arXiv 论文。`,
  inputSchema: academicSearchInputSchema,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  call: async function* (input, deps) {
    yield { stage: "searching academic sources" };

    const settings = await getSettings();
    const hits = await runAcademicSearch({
      query: input.query,
      limit: input.limit,
      settings: {
        semanticScholarApiKey: settings.semanticScholarApiKey,
        openAlexApiKey: settings.openAlexApiKey,
      },
      signal: deps.signal,
    });

    return {
      data: hits,
      newMessages: [catalogMessage(hits, input.query)],
    };
  },
};
