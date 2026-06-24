import { describe, it, expect } from "vitest";
import { semanticScholarAdapter } from "./semanticScholar";

function mockFetchFn(routes: Record<string, { status: number; body: unknown }>) {
  return async (url: string | URL | Request): Promise<Response> => {
    const key = typeof url === "string" ? url : url.toString();
    const route = routes[key];
    if (!route) {
      throw new TypeError(`Network error for ${key}`);
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("semanticScholarAdapter", () => {
  it("parses hits with arxiv id and sends x-api-key when provided", async () => {
    const url =
      "https://api.semanticscholar.org/graph/v1/paper/search?query=transformer&fields=title%2Cauthors%2Cabstract%2CexternalIds&limit=5";
    const fetchFn = mockFetchFn({
      [url]: {
        status: 200,
        body: {
          data: [
            {
              paperId: "abc123",
              title: "Attention Is All You Need",
              abstract: "We propose transformers.",
              authors: [{ name: "Alice" }, { name: "Bob" }],
              externalIds: { ArXiv: "1706.03762" },
            },
            {
              paperId: "no-arxiv",
              title: "No ArXiv Paper",
              abstract: "Missing arxiv id.",
              authors: [{ name: "Carol" }],
              externalIds: { DOI: "10.1234/example" },
            },
          ],
        },
      },
    });

    let capturedHeaders: HeadersInit | undefined;
    const fetchWithHeaderCapture: typeof fetch = async (input, init) => {
      capturedHeaders = init?.headers;
      return fetchFn(input);
    };

    const hits = await semanticScholarAdapter.search("transformer", {
      limit: 5,
      apiKey: "ss-test-key",
      signal: AbortSignal.timeout(5000),
      fetchFn: fetchWithHeaderCapture,
    });

    expect(hits).toEqual([
      {
        arxivId: "1706.03762",
        title: "Attention Is All You Need",
        authors: ["Alice", "Bob"],
        abstract: "We propose transformers.",
        source: "semantic-scholar",
        externalId: "abc123",
      },
    ]);
    expect(capturedHeaders).toEqual({ "x-api-key": "ss-test-key" });
  });

  it("returns empty array on network failure", async () => {
    const fetchFn = async () => {
      throw new Error("offline");
    };

    const hits = await semanticScholarAdapter.search("transformer", {
      limit: 5,
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    const url =
      "https://api.semanticscholar.org/graph/v1/paper/search?query=transformer&fields=title%2Cauthors%2Cabstract%2CexternalIds&limit=5";
    const fetchFn = mockFetchFn({
      [url]: { status: 429, body: { message: "rate limited" } },
    });

    const hits = await semanticScholarAdapter.search("transformer", {
      limit: 5,
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toEqual([]);
  });
});
