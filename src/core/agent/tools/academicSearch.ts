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
  const gateNotice =
    "Results are NOT automatically added to the Paper Box. Ask the user to review each hit and click 「纳入」 for papers they want imported — inclusion is the only legitimate entry for external literature.";

  if (hits.length === 0) {
    return [
      `Academic search for "${query}" returned no hits.`,
      "",
      gateNotice,
    ].join("\n");
  }

  const lines = [
    `Academic search results for "${query}" (${hits.length} hits):`,
    "",
    gateNotice,
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
  description: `Search external academic literature (Semantic Scholar / OpenAlex, arXiv-centric). Returns arxivId, title, authors, and abstract for each hit. Read-only, network access; academic sources have a light threat model — inclusion into the Paper Box is the controlled action.

IMPORTANT — results are NOT automatically added to the Paper Box. Have the user review each hit and click 「纳入」(include) for relevant papers; per-paper inclusion is the only legitimate entry for external literature into the box.

Note (implementation): import currently supports arXiv papers with arXiv HTML only. When new import paths are added, update this tool description and the agent system prompt accordingly.

中文：外部学术文献搜索（Semantic Scholar / OpenAlex，以 arXiv 为中心），返回 arxivId、标题、作者与摘要。只读、联网；学术来源威胁模型较轻，纳入盒子才是受控动作。

重要：搜索结果**不自动进盒**。请让用户逐篇审查，对相关论文点「纳入」；逐篇纳入是外部文献进入 Paper Box 的唯一合法入口。

注释：当前纳入仅支持有 arXiv HTML 的 arXiv 论文；将来若支持新引入方式，需同步更新本说明与系统提示。`,
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
