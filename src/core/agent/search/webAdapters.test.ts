import { describe, expect, it, vi } from "vitest";
import { perplexitySearch, runWebSearch, tavilySearch } from "./webAdapters";

function mockFetch(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}): typeof fetch {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.json,
    text: async () => response.text ?? "",
  })) as unknown as typeof fetch;
}

describe("runWebSearch", () => {
  it("returns missing_api_key when the selected provider has no key", async () => {
    const outcome = await runWebSearch({
      query: "UIUC weather",
      maxResults: 5,
      provider: "tavily",
      tavilyApiKey: "  ",
      perplexityApiKey: "px-key",
      signal: new AbortController().signal,
    });

    expect(outcome).toEqual({
      hits: [],
      failure: { reason: "missing_api_key", provider: "tavily" },
    });
  });

  it("returns empty_query for blank query", async () => {
    const outcome = await runWebSearch({
      query: "   ",
      maxResults: 5,
      provider: "tavily",
      tavilyApiKey: "tv-key",
      perplexityApiKey: "",
      signal: new AbortController().signal,
    });

    expect(outcome.failure?.reason).toBe("empty_query");
  });
});

describe("tavilySearch", () => {
  it("returns http_error when the API responds with non-OK status", async () => {
    const fetchFn = mockFetch({
      ok: false,
      status: 401,
      text: "Unauthorized",
    });

    const outcome = await tavilySearch("weather", {
      maxResults: 5,
      apiKey: "bad-key",
      provider: "tavily",
      signal: new AbortController().signal,
      fetchFn,
    });

    expect(outcome.hits).toEqual([]);
    expect(outcome.failure).toEqual({
      reason: "http_error",
      provider: "tavily",
      detail: "HTTP 401: Unauthorized",
    });
  });

  it("returns hits on success", async () => {
    const fetchFn = mockFetch({
      ok: true,
      json: {
        results: [
          {
            title: "Champaign forecast",
            url: "https://example.com/weather",
            content: "Sunny tomorrow.",
          },
        ],
      },
    });

    const outcome = await tavilySearch("weather", {
      maxResults: 5,
      apiKey: "tv-key",
      provider: "tavily",
      signal: new AbortController().signal,
      fetchFn,
    });

    expect(outcome.failure).toBeUndefined();
    expect(outcome.hits).toEqual([
      {
        title: "Champaign forecast",
        url: "https://example.com/weather",
        snippet: "Sunny tomorrow.",
      },
    ]);
  });

  it("returns network_error when fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    const outcome = await tavilySearch("weather", {
      maxResults: 5,
      apiKey: "tv-key",
      provider: "tavily",
      signal: new AbortController().signal,
      fetchFn,
    });

    expect(outcome.failure).toEqual({
      reason: "network_error",
      provider: "tavily",
      detail: "connection refused",
    });
  });
});

describe("perplexitySearch", () => {
  it("calls /v1/sonar with min output tokens, maps search_results only", async () => {
    const fetchFn = mockFetch({
      ok: true,
      json: {
        choices: [{ message: { content: "ignored answer text" } }],
        search_results: [
          {
            title: "Champaign forecast",
            url: "https://example.com/weather",
            snippet: "Sunny tomorrow.",
          },
        ],
      },
    });

    const outcome = await perplexitySearch("weather", {
      maxResults: 5,
      apiKey: "px-key",
      provider: "perplexity",
      signal: new AbortController().signal,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.perplexity.ai/v1/sonar",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: "weather" }],
          max_tokens: 16,
        }),
      }),
    );
    expect(outcome.failure).toBeUndefined();
    expect(outcome.hits).toEqual([
      {
        title: "Champaign forecast",
        url: "https://example.com/weather",
        snippet: "Sunny tomorrow.",
      },
    ]);
  });

  it("returns http_error when the API responds with non-OK status", async () => {
    const fetchFn = mockFetch({
      ok: false,
      status: 401,
      text: "Unauthorized",
    });

    const outcome = await perplexitySearch("weather", {
      maxResults: 5,
      apiKey: "bad-key",
      provider: "perplexity",
      signal: new AbortController().signal,
      fetchFn,
    });

    expect(outcome.hits).toEqual([]);
    expect(outcome.failure).toEqual({
      reason: "http_error",
      provider: "perplexity",
      detail: "HTTP 401: Unauthorized",
    });
  });

  it("returns network_error when fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    const outcome = await perplexitySearch("weather", {
      maxResults: 5,
      apiKey: "px-key",
      provider: "perplexity",
      signal: new AbortController().signal,
      fetchFn,
    });

    expect(outcome.failure).toEqual({
      reason: "network_error",
      provider: "perplexity",
      detail: "connection refused",
    });
  });
});
