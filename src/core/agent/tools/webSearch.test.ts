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

  it("returns hits and provenance-tagged newMessages with Sources requirement", async () => {
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
    });

    const runSpy = vi
      .spyOn(webAdaptersModule, "runWebSearch")
      .mockResolvedValue(MOCK_HITS);

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
    expect(result.data).toEqual(MOCK_HITS);

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

  it("fail-open: adapter error returns empty hits without throwing", async () => {
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
    });

    vi.spyOn(webAdaptersModule, "runWebSearch").mockRejectedValue(
      new Error("network failure"),
    );

    const result = await callTool(
      { query: "fail test", maxResults: 3 },
      makeDeps(),
    );

    expect(result.data).toEqual([]);
    const text = result.newMessages?.[0]?.content[0] as { text: string };
    expect(text.text).toContain("[来源: web]");
    expect(text.text).toContain("returned no results");
  });

  it("fail-open: missing key returns empty hits without throwing", async () => {
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
    });

    const runSpy = vi.spyOn(webAdaptersModule, "runWebSearch");

    const result = await callTool(
      { query: "no key test", maxResults: 5 },
      makeDeps(),
    );

    expect(runSpy).toHaveBeenCalled();
    expect(result.data).toEqual([]);

    const text = result.newMessages?.[0]?.content[0] as { text: string };
    expect(text.text).toContain("[来源: web]");
    expect(text.text).toContain("returned no results");
    expect(text.text).toContain("Sources:");
  });

  it("description includes current month/year and citation requirement", () => {
    const description = buildWebSearchDescription(new Date("2026-06-24T12:00:00Z"));
    expect(description).toContain("June 2026");
    expect(description).toContain("Sources:");
    expect(description).toContain("fail-open");
    expect(webSearchTool.description).toContain("Sources:");
  });
});
