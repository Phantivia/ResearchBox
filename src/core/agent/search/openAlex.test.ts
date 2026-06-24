import { describe, it, expect } from "vitest";
import {
  openAlexAdapter,
  parseArxivIdFromOpenAlexIds,
  reconstructAbstract,
} from "./openAlex";

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

describe("reconstructAbstract", () => {
  it("rebuilds plain text from inverted index positions", () => {
    const abstract = reconstructAbstract({
      This: [0],
      is: [1],
      a: [2],
      simple: [3],
      test: [4],
    });

    expect(abstract).toBe("This is a simple test");
  });

  it("returns empty string for missing index", () => {
    expect(reconstructAbstract(null)).toBe("");
    expect(reconstructAbstract(undefined)).toBe("");
    expect(reconstructAbstract({})).toBe("");
  });
});

describe("parseArxivIdFromOpenAlexIds", () => {
  it("parses arxiv id from ids.doi arxiv DOI", () => {
    expect(
      parseArxivIdFromOpenAlexIds({
        doi: "https://doi.org/10.48550/arxiv.2010.11929",
      }),
    ).toBe("2010.11929");
  });

  it("parses arxiv id from top-level doi fallback", () => {
    expect(parseArxivIdFromOpenAlexIds(undefined, "https://doi.org/10.48550/arxiv.2010.11929")).toBe(
      "2010.11929",
    );
  });
});

describe("openAlexAdapter", () => {
  it("returns empty array without api key", async () => {
    const fetchFn = async () => {
      throw new Error("should not fetch");
    };

    const hits = await openAlexAdapter.search("transformer", {
      limit: 5,
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toEqual([]);
  });

  it("parses hits and reconstructs abstract", async () => {
    const url =
      "https://api.openalex.org/works?search=transformer&select=id%2Cdisplay_name%2Cauthorships%2Cabstract_inverted_index%2Cids%2Cdoi&per_page=5&api_key=oa-test-key";
    const fetchFn = mockFetchFn({
      [url]: {
        status: 200,
        body: {
          results: [
            {
              id: "https://openalex.org/W3094502228",
              display_name: "Vision Transformer",
              doi: "https://doi.org/10.48550/arxiv.2010.11929",
              ids: {
                openalex: "https://openalex.org/W3094502228",
                doi: "https://doi.org/10.48550/arxiv.2010.11929",
              },
              authorships: [
                {
                  author: { display_name: "Alexey Dosovitskiy" },
                  raw_author_name: "Dosovitskiy, Alexey",
                },
              ],
              abstract_inverted_index: {
                An: [0],
                image: [1],
                is: [2],
                worth: [3],
                words: [4],
              },
            },
            {
              id: "https://openalex.org/W-no-arxiv",
              display_name: "No arXiv DOI",
              ids: { openalex: "https://openalex.org/W-no-arxiv" },
              authorships: [],
              abstract_inverted_index: { hello: [0] },
            },
          ],
        },
      },
    });

    const hits = await openAlexAdapter.search("transformer", {
      limit: 5,
      apiKey: "oa-test-key",
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toEqual([
      {
        arxivId: "2010.11929",
        title: "Vision Transformer",
        authors: ["Alexey Dosovitskiy"],
        abstract: "An image is worth words",
        source: "openalex",
        externalId: "https://openalex.org/W3094502228",
      },
    ]);
  });

  it("returns empty array on fetch failure", async () => {
    const fetchFn = async () => {
      throw new Error("offline");
    };

    const hits = await openAlexAdapter.search("transformer", {
      limit: 5,
      apiKey: "oa-test-key",
      signal: AbortSignal.timeout(5000),
      fetchFn,
    });

    expect(hits).toEqual([]);
  });
});
