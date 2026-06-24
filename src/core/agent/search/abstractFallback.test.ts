import { describe, it, expect } from "vitest";
import { fillMissingAbstracts } from "./abstractFallback";
import type { AcademicHit } from "./types";

const MINIMAL_ARXIV_HTML = `<!DOCTYPE html>
<html>
<body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Sample Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Alice</span></div>
  <div class="ltx_abstract">
    <p class="ltx_p">Fetched abstract from arxiv HTML.</p>
  </div>
</article>
</body>
</html>`;

function makeHit(overrides: Partial<AcademicHit> = {}): AcademicHit {
  return {
    arxivId: "2401.12345",
    title: "Sample Paper",
    authors: ["Alice"],
    abstract: "",
    source: "semantic-scholar",
    ...overrides,
  };
}

function mockFetchFn(routes: Record<string, { status: number; body: string }>) {
  return async (url: string | URL | Request): Promise<Response> => {
    const key = typeof url === "string" ? url : url.toString();
    const route = routes[key];
    if (!route) {
      throw new TypeError(`Network error for ${key}`);
    }
    return new Response(route.body, { status: route.status });
  };
}

describe("fillMissingAbstracts", () => {
  it("fills missing abstract from arxiv HTML", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.12345/": {
        status: 200,
        body: MINIMAL_ARXIV_HTML,
      },
    });

    const hits = await fillMissingAbstracts([makeHit()], { fetchFn });

    expect(hits[0]?.abstract).toBe("Fetched abstract from arxiv HTML.");
  });

  it("keeps empty abstract when fetch fails", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.12345/": { status: 404, body: "" },
      "https://ar5iv.org/html/2401.12345/": { status: 404, body: "" },
    });

    const hits = await fillMissingAbstracts([makeHit()], { fetchFn });

    expect(hits[0]?.abstract).toBe("");
  });

  it("does not refetch when abstract already present", async () => {
    let fetchCount = 0;
    const fetchFn = async () => {
      fetchCount += 1;
      return new Response("", { status: 200 });
    };

    const hits = await fillMissingAbstracts(
      [makeHit({ abstract: "Already here." })],
      { fetchFn },
    );

    expect(hits[0]?.abstract).toBe("Already here.");
    expect(fetchCount).toBe(0);
  });
});
