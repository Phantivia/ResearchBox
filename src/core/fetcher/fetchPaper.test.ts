import { describe, it, expect } from "vitest";
import { fetchPaperHtml, NoHtmlVersionError } from "./fetchPaper";

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

describe("fetchPaperHtml", () => {
  it("returns arxiv source when primary succeeds", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.12345v2/": {
        status: 200,
        body: "<html>arxiv content</html>",
      },
    });

    const result = await fetchPaperHtml("2401.12345", "v2", { fetchFn });

    expect(result.source).toBe("arxiv");
    expect(result.html).toBe("<html>arxiv content</html>");
    expect(result.resolvedUrl).toBe("https://arxiv.org/html/2401.12345v2/");
  });

  it("returns arxiv source when primary succeeds (no version)", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.12345/": {
        status: 200,
        body: "<html>latest</html>",
      },
    });

    const result = await fetchPaperHtml("2401.12345", null, { fetchFn });

    expect(result.source).toBe("arxiv");
    expect(result.html).toBe("<html>latest</html>");
    expect(result.resolvedUrl).toBe("https://arxiv.org/html/2401.12345/");
  });

  it("falls back to ar5iv when primary returns 404", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.12345v2/": { status: 404, body: "Not Found" },
      "https://ar5iv.org/html/2401.12345/": {
        status: 200,
        body: "<html>ar5iv content</html>",
      },
    });

    const result = await fetchPaperHtml("2401.12345", "v2", { fetchFn });

    expect(result.source).toBe("ar5iv");
    expect(result.html).toBe("<html>ar5iv content</html>");
    expect(result.resolvedUrl).toBe("https://ar5iv.org/html/2401.12345/");
  });

  it("falls back to ar5iv when primary throws network error", async () => {
    const fetchFn = mockFetchFn({
      // No entry for arxiv → will throw
      "https://ar5iv.org/html/2401.12345/": {
        status: 200,
        body: "<html>ar5iv fallback</html>",
      },
    });

    const result = await fetchPaperHtml("2401.12345", null, { fetchFn });

    expect(result.source).toBe("ar5iv");
    expect(result.html).toBe("<html>ar5iv fallback</html>");
  });

  it("throws NoHtmlVersionError when both sources fail with non-2xx", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.12345/": { status: 404, body: "" },
      "https://ar5iv.org/html/2401.12345/": { status: 500, body: "" },
    });

    await expect(
      fetchPaperHtml("2401.12345", null, { fetchFn }),
    ).rejects.toThrow(NoHtmlVersionError);

    await expect(
      fetchPaperHtml("2401.12345", null, { fetchFn }),
    ).rejects.toThrow("No HTML version available for 2401.12345");
  });

  it("throws NoHtmlVersionError when both sources throw network errors", async () => {
    const fetchFn = mockFetchFn({});

    await expect(
      fetchPaperHtml("2401.12345", null, { fetchFn }),
    ).rejects.toThrow(NoHtmlVersionError);
  });

  it("NoHtmlVersionError exposes arxivId", async () => {
    const fetchFn = mockFetchFn({});

    try {
      await fetchPaperHtml("math.GT/0309136", null, { fetchFn });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NoHtmlVersionError);
      expect((err as NoHtmlVersionError).arxivId).toBe("math.GT/0309136");
    }
  });
});
