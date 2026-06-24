import { z } from "zod";
import { getSettings } from "@/db";
import { withProvenance } from "../provenance";
import {
  providerLabel,
  runWebSearch,
  type WebHit,
  type WebSearchFailure,
  type WebSearchOutcome,
} from "../search/webAdapters";
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

Note: Requires a user-configured Tavily or Perplexity API key in Settings. If search cannot run (missing key, network error, etc.), the tool returns an explicit failure message — explain that to the user; do NOT pretend you searched the web.

中文：开放域网页搜索，获取论文盒子之外的实时信息。只读、可并行；结果带 [来源: web] 标签。
重要：回答末尾必须附 "Sources:" 段落，以 [标题](URL) 列出引用来源。
检索近期信息时请使用正确年份（当前为 ${monthYear}）。
未配置 API key 或请求失败时，工具会返回明确说明，勿假装已联网搜索。`;
}

const SOURCES_REQUIREMENT = `CRITICAL REQUIREMENT — You MUST follow this:
- After answering the user's question, include a "Sources:" section at the end of your response
- In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
- This is MANDATORY — never skip including sources in your response when search results were used`;

function formatFailureMessage(failure: WebSearchFailure, query: string): string {
  const label = providerLabel(failure.provider);

  switch (failure.reason) {
    case "missing_api_key":
      return [
        `Web search for "${query}" did NOT run: no API key configured for ${label}.`,
        "",
        "Tell the user web search is unavailable until they configure a Tavily or Perplexity API key in Settings → Agent capabilities, and ensure web search is enabled.",
        "Do NOT claim you searched the web or cite fabricated sources.",
      ].join("\n");
    case "empty_query":
      return [
        `Web search for "${query}" did NOT run: invalid input (${failure.detail ?? "empty query"}).`,
        "",
        "Fix the query and retry, or answer from other tools / general knowledge.",
      ].join("\n");
    case "http_error":
      return [
        `Web search for "${query}" failed: ${label} API returned ${failure.detail ?? "an HTTP error"}.`,
        "",
        "The API key may be invalid, expired, or the provider may be down. Tell the user search failed; do NOT invent results.",
      ].join("\n");
    case "network_error":
      return [
        `Web search for "${query}" failed: network error${failure.detail ? ` (${failure.detail})` : ""}.`,
        "",
        "Tell the user the search could not reach the provider. Do NOT invent results.",
      ].join("\n");
    case "timeout":
      return [
        `Web search for "${query}" failed: request timed out after ${failure.detail ?? `${30}s`}.`,
        "",
        "Tell the user the search timed out. Do NOT invent results.",
      ].join("\n");
    case "aborted":
      return [
        `Web search for "${query}" was aborted before completion.`,
        "",
        "Do NOT invent results.",
      ].join("\n");
  }
}

export function formatWebResults(outcome: WebSearchOutcome, query: string): string {
  if (outcome.failure) {
    return formatFailureMessage(outcome.failure, query);
  }

  if (outcome.hits.length === 0) {
    return [
      `Web search for "${query}" completed successfully but returned no hits.`,
      "",
      "Try rephrasing the query or answer from other available context.",
    ].join("\n");
  }

  const lines = [
    `Web search results for "${query}" (${outcome.hits.length} hits):`,
    "",
    SOURCES_REQUIREMENT,
    "",
  ];

  for (const [index, hit] of outcome.hits.entries()) {
    lines.push(
      `${index + 1}. [${hit.title}](${hit.url})`,
      `   ${hit.snippet || "(no snippet)"}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

function catalogMessage(summary: string): AgentMessage {
  return {
    role: "user",
    uiHidden: true,
    content: [
      {
        type: "text",
        text: withProvenance("web", summary),
      },
    ],
  };
}

function createWebSearchTool(now = new Date()): Tool<typeof webSearchInputSchema, string> {
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
      const outcome = await runWebSearch({
        query: input.query,
        maxResults: input.maxResults,
        provider: settings.webSearchProvider,
        tavilyApiKey: settings.tavilyApiKey,
        perplexityApiKey: settings.perplexityApiKey,
        signal: deps.signal,
      });

      const summary = formatWebResults(outcome, input.query);

      return {
        data: summary,
        newMessages: [catalogMessage(summary)],
      };
    },
  };
}

export const webSearchTool = createWebSearchTool();

export { createWebSearchTool };
export type { WebHit };
