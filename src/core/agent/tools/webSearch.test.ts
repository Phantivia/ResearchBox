import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentDeps } from "../types";
import type { WebHit } from "../search/webAdapters";
import * as webAdaptersModule from "../search/webAdapters";
import * as dbModule from "@/db";
import {
  webSearchTool,
  webSearchInputSchema,
  buildWebSearchDescription,
  formatWebResults,
} from "./webSearch";

const MOCK_HITS: WebHit[] = [
  {
    title: "Latest AI News",
    url: "https://example.com/ai-news",
    snippet: "Breakthrough in transformer efficiency.",
  },
  {
    title: "Research Overview",
    url: "https://example.org/overview",
    snippet: "A survey of recent developments.",
  },
];

function makeDeps(): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
    llm: { id: "fake", chat: async () => "" },
    store: {
      messages: [],
      pendingApprovals: [],
      runningTools: {},
      permissionMode: "default",
      append: () => {},
      enqueueApproval: () => {},
      setRunningTool: () => {},
      clearRunningTool: () => {},
    },
    signal: new AbortController().signal,
    requestApproval: async () => true,
  };
}

async function callTool(
  input: { query: string; maxResults?: number },
  deps: AgentDeps,
) {
  const parsed = webSearchInputSchema.parse(input);
  const gen = webSearchTool.call(parsed, deps);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

describe("webSearchTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is read-only and concurrency-safe", () => {
    expect(webSearchTool.isReadOnly({ query: "AI news", maxResults: 5 })).toBe(
      true,
    );
    expect(
      webSearchTool.isConcurrencySafe({ query: "AI news", maxResults: 5 }),
    ).toBe(true);
  });

  it("checkPermissions asks with low risk", async () => {
    const result = await webSearchTool.checkPermissions(
      { query: "transformer papers", maxResults: 5 },
      makeDeps(),
    );
    expect(result).toEqual({
      behavior: "ask",
      reason: "联网搜索: transformer papers",
      risk: "low",
    });
  });

  it("returns summary string and provenance-tagged newMessages with Sources requirement", async () => {
    vi.spyOn(dbModule, "getSettings").mockResolvedValue({
      activeProviderId: null,
      viewMode: "original",
      targetLang: "zh",
      debugMode: false,
      uiLocale: "zh",
      lastProjectId: null,
      activePaletteId: "default",
      customPalette: null,
      semanticScholarApiKey: "",
      openAlexApiKey: "",
      allowWeb: true,
      allowCode: false,
      webSearchProvider: "tavily",
      tavilyApiKey: "tv-test",
      perplexityApiKey: "",
      permissionMode: "default",
    });

    const runSpy = vi.spyOn(webAdaptersModule, "runWebSearch").mockResolvedValue({
      hits: MOCK_HITS,
    });

    const result = await callTool(
      { query: "latest AI news", maxResults: 5 },
      makeDeps(),
    );

    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "latest AI news",
        maxResults: 5,
        provider: "tavily",
        tavilyApiKey: "tv-test",
      }),
    );
    expect(result.data).toContain("Web search results for");
    expect(result.data).toContain("[Latest AI News](https://example.com/ai-news)");

    const text = result.newMessages?.[0]?.content[0];
    expect(text).toEqual({
      type: "text",
      text: expect.stringContaining("[来源: web]"),
    });

    const body = (text as { text: string }).text;
    expect(body).toContain("Sources:");
    expect(body).toContain("[Title](URL)");
    expect(body).toContain("[Latest AI News](https://example.com/ai-news)");
    expect(body).toContain("Breakthrough in transformer efficiency.");
    expect(body).toContain("[Research Overview](https://example.org/overview)");
  });

  it("fail-open: adapter error returns explicit failure summary without throwing", async () => {
    vi.spyOn(dbModule, "getSettings").mockResolvedValue({
      activeProviderId: null,
      viewMode: "original",
      targetLang: "zh",
      debugMode: false,
      uiLocale: "zh",
      lastProjectId: null,
      activePaletteId: "default",
      customPalette: null,
      semanticScholarApiKey: "",
      openAlexApiKey: "",
      allowWeb: true,
      allowCode: false,
      webSearchProvider: "perplexity",
      tavilyApiKey: "",
      perplexityApiKey: "px-test",
      permissionMode: "default",
    });

    vi.spyOn(webAdaptersModule, "runWebSearch").mockResolvedValue({
      hits: [],
      failure: {
        reason: "network_error",
        provider: "perplexity",
        detail: "network failure",
      },
    });

    const result = await callTool(
      { query: "fail test", maxResults: 3 },
      makeDeps(),
    );

    expect(result.data).toContain("network error");
    expect(result.data).toContain("Do NOT invent results");
    const text = result.newMessages?.[0]?.content[0] as { text: string };
    expect(text.text).toContain("[来源: web]");
    expect(text.text).toContain("network error");
  });

  it("fail-open: missing key returns explicit configuration message", async () => {
    vi.spyOn(dbModule, "getSettings").mockResolvedValue({
      activeProviderId: null,
      viewMode: "original",
      targetLang: "zh",
      debugMode: false,
      uiLocale: "zh",
      lastProjectId: null,
      activePaletteId: "default",
      customPalette: null,
      semanticScholarApiKey: "",
      openAlexApiKey: "",
      allowWeb: true,
      allowCode: false,
      webSearchProvider: "tavily",
      tavilyApiKey: "",
      perplexityApiKey: "",
      permissionMode: "default",
    });

    const runSpy = vi.spyOn(webAdaptersModule, "runWebSearch").mockResolvedValue({
      hits: [],
      failure: { reason: "missing_api_key", provider: "tavily" },
    });

    const result = await callTool(
      { query: "no key test", maxResults: 5 },
      makeDeps(),
    );

    expect(runSpy).toHaveBeenCalled();
    expect(result.data).toContain("no API key configured");
    expect(result.data).toContain("Do NOT claim you searched the web");

    const text = result.newMessages?.[0]?.content[0] as { text: string };
    expect(text.text).toContain("[来源: web]");
    expect(text.text).toContain("no API key configured");
  });

  it("description includes current month/year and citation requirement", () => {
    const description = buildWebSearchDescription(new Date("2026-06-24T12:00:00Z"));
    expect(description).toContain("June 2026");
    expect(description).toContain("Sources:");
    expect(description).toContain("explicit failure message");
    expect(webSearchTool.description).toContain("Sources:");
  });
});

describe("formatWebResults", () => {
  it("distinguishes empty hits from configuration failure", () => {
    const emptyHits = formatWebResults({ hits: [] }, "weather");
    expect(emptyHits).toContain("completed successfully but returned no hits");

    const missingKey = formatWebResults(
      { hits: [], failure: { reason: "missing_api_key", provider: "tavily" } },
      "weather",
    );
    expect(missingKey).toContain("did NOT run");
    expect(missingKey).toContain("no API key configured");
  });
});
