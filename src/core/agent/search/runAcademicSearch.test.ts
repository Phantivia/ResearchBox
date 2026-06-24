import { describe, it, expect } from "vitest";
import { runAcademicSearch } from "./runAcademicSearch";

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

const SS_URL =
  "https://api.semanticscholar.org/graph/v1/paper/search?query=transformer&fields=title%2Cauthors%2Cabstract%2CexternalIds&limit=5";
const OA_URL =
  "https://api.openalex.org/works?search=transformer&select=id%2Cdisplay_name%2Cauthorships%2Cabstract_inverted_index%2Cids%2Cdoi&per_page=5&api_key=oa-key";

describe("runAcademicSearch", () => {
  it("uses OpenAlex when openAlexApiKey is present", async () => {
    const fetchFn = mockFetchFn({
      [OA_URL]: {
        status: 200,
        body: {
          results: [
            {
              id: "https://openalex.org/W1",
              display_name: "OpenAlex Hit",
              doi: "https://doi.org/10.48550/arxiv.1706.03762",
              ids: { doi: "https://doi.org/10.48550/arxiv.1706.03762" },
              authorships: [{ author: { display_name: "Alice" } }],
              abstract_inverted_index: { OpenAlex: [0], hit: [1] },
            },
          ],
        },
      },
    });

    const hits = await runAcademicSearch({
      query: "transformer",
      limit: 5,
      settings: {
        openAlexApiKey: "oa-key",
        semanticScholarApiKey: "ss-key",
      },
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.source).toBe("openalex");
    expect(hits[0]?.arxivId).toBe("1706.03762");
  });

  it("falls back to Semantic Scholar when no OpenAlex key", async () => {
    const fetchFn = mockFetchFn({
      [SS_URL]: {
        status: 200,
        body: {
          data: [
            {
              paperId: "ss1",
              title: "SS Hit",
              abstract: "From SS.",
              authors: [{ name: "Bob" }],
              externalIds: { ArXiv: "1706.03762" },
            },
          ],
        },
      },
    });

    const hits = await runAcademicSearch({
      query: "transformer",
      limit: 5,
      settings: {
        openAlexApiKey: "",
        semanticScholarApiKey: "ss-key",
      },
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.source).toBe("semantic-scholar");
  });

  it("falls back to Semantic Scholar when OpenAlex returns empty", async () => {
    const fetchFn = mockFetchFn({
      [OA_URL]: {
        status: 200,
        body: { results: [] },
      },
      [SS_URL]: {
        status: 200,
        body: {
          data: [
            {
              paperId: "ss2",
              title: "Fallback SS Hit",
              abstract: "Fallback.",
              authors: [{ name: "Carol" }],
              externalIds: { ArXiv: "2010.11929" },
            },
          ],
        },
      },
    });

    const hits = await runAcademicSearch({
      query: "transformer",
      limit: 5,
      settings: {
        openAlexApiKey: "oa-key",
        semanticScholarApiKey: "",
      },
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.source).toBe("semantic-scholar");
    expect(hits[0]?.title).toBe("Fallback SS Hit");
  });

  it("deduplicates by arxivId keeping first occurrence", async () => {
    const fetchFn = mockFetchFn({
      [OA_URL]: {
        status: 200,
        body: {
          results: [
            {
              id: "https://openalex.org/W1",
              display_name: "First",
              doi: "https://doi.org/10.48550/arxiv.1706.03762",
              ids: { doi: "https://doi.org/10.48550/arxiv.1706.03762" },
              authorships: [],
              abstract_inverted_index: { first: [0] },
            },
          ],
        },
      },
      [SS_URL]: {
        status: 200,
        body: {
          data: [
            {
              paperId: "dup",
              title: "Duplicate",
              abstract: "dup",
              authors: [],
              externalIds: { ArXiv: "1706.03762" },
            },
          ],
        },
      },
    });

    const hits = await runAcademicSearch({
      query: "transformer",
      limit: 5,
      settings: {
        openAlexApiKey: "oa-key",
        semanticScholarApiKey: "",
      },
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.source).toBe("openalex");
  });
});
