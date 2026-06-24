import { z } from "zod";
import { getSettings } from "@/db";
import { withProvenance } from "../provenance";
import { runWebSearch, type WebHit } from "../search/webAdapters";
import type { AgentMessage, Tool } from "../types";

export const webSearchInputSchema = z.strictObject({
  query: z.string(),
  maxResults: z.number().default(5),
});

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

function currentMonthYear(now: Date): string {
  return now.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function buildWebSearchDescription(now = new Date()): string {
  const monthYear = currentMonthYear(now);

  return `Search the open web for up-to-date information beyond the Paper Box (news, documentation, general knowledge). Read-only, network access; results are tagged [来源: web].

IMPORTANT — citation requirement:
- After answering the user, you MUST include a "Sources:" section listing relevant URLs as markdown hyperlinks: [Title](URL)
- This is MANDATORY — never skip sources when search results were used

IMPORTANT — use the correct year in search queries:
- The current month is ${monthYear}. Use this year when searching for recent information.

Note: Requires a user-configured Tavily or Perplexity API key. If no key is configured for the selected provider, searches return empty (fail-open) without breaking the agent.

中文：开放域网页搜索，获取论文盒子之外的实时信息。只读、可并行；结果带 [来源: web] 标签。
重要：回答末尾必须附 "Sources:" 段落，以 [标题](URL) 列出引用来源。
检索近期信息时请使用正确年份（当前为 ${monthYear}）。
未配置所选 provider 的 API key 时返回空结果（fail-open）。`;
}

const SOURCES_REQUIREMENT = `CRITICAL REQUIREMENT — You MUST follow this:
- After answering the user's question, include a "Sources:" section at the end of your response
- In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
- This is MANDATORY — never skip including sources in your response when search results were used`;

function formatWebResults(hits: WebHit[], query: string): string {
  const noKeyNote =
    "Note: If no API key is configured for the selected provider, searches return empty (fail-open).";

  if (hits.length === 0) {
    return [
      `Web search for "${query}" returned no results.`,
      "",
      noKeyNote,
      "",
      SOURCES_REQUIREMENT,
    ].join("\n");
  }

  const lines = [
    `Web search results for "${query}" (${hits.length} hits):`,
    "",
    SOURCES_REQUIREMENT,
    "",
  ];

  for (const [index, hit] of hits.entries()) {
    lines.push(
      `${index + 1}. [${hit.title}](${hit.url})`,
      `   ${hit.snippet || "(no snippet)"}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

function catalogMessage(hits: WebHit[], query: string): AgentMessage {
  return {
    role: "user",
    uiHidden: true,
    content: [
      {
        type: "text",
        text: withProvenance("web", formatWebResults(hits, query)),
      },
    ],
  };
}

function createWebSearchTool(now = new Date()): Tool<typeof webSearchInputSchema, WebHit[]> {
  return {
    name: "websearch",
    description: buildWebSearchDescription(now),
    inputSchema: webSearchInputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    checkPermissions: async (input) => ({
      behavior: "ask",
      reason: `联网搜索: ${input.query}`,
      risk: "low",
    }),
    call: async function* (input, deps) {
      yield { stage: "searching the web" };

      const settings = await getSettings();
      let hits: WebHit[] = [];
      try {
        hits = await runWebSearch({
          query: input.query,
          maxResults: input.maxResults,
          provider: settings.webSearchProvider,
          tavilyApiKey: settings.tavilyApiKey,
          perplexityApiKey: settings.perplexityApiKey,
          signal: deps.signal,
        });
      } catch {
        hits = [];
      }

      return {
        data: hits,
        newMessages: [catalogMessage(hits, input.query)],
      };
    },
  };
}

export const webSearchTool = createWebSearchTool();

export { createWebSearchTool };
