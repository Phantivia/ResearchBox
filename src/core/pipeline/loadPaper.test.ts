import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { PaperIRSchema } from "@/core/ir";
import type { LLMProvider } from "@/core/llm";
import { db, getPaper, savePaper } from "@/db";
import {
  InvalidArxivIdError,
  loadPaperForDisplay,
  loadPaperReadonly,
  loadPaperWithTranslation,
  type LoadPaperWithTranslationProgress,
} from "./loadPaper";
import { OfflineUncachedError } from "@/core/network";

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Pipeline Test Paper</h1>
  <div class="ltx_authors">
    <span class="ltx_personname">Eve Researcher</span>
  </div>
  <div class="ltx_abstract">
    <p class="ltx_p">A sample abstract for pipeline testing.</p>
  </div>
  <section class="ltx_section">
    <h2 class="ltx_title ltx_title_section">Main</h2>
    <p class="ltx_p">Body paragraph with inline math
      <math display="inline">
        <semantics>
          <mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>
          <annotation encoding="application/x-tex">a+b</annotation>
        </semantics>
      </math>
      here.</p>
  </section>
</article>
</body>
</html>`;

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

function makeAutoTranslationProvider(): LLMProvider {
  return {
    id: "mock",
    chat(opts) {
      const raw = opts.messages[0]?.content ?? "";
      const jsonLine = raw.split("\n")[0] ?? "{}";
      const parsed = JSON.parse(jsonLine) as { blocks?: { id: string }[] };
      const translations = (parsed.blocks ?? []).map((block) => ({
        id: block.id,
        translation: `[译] ${block.id}`,
      }));
      return Promise.resolve(JSON.stringify({ translations }));
    },
  };
}

async function collectTranslationProgress(
  input: string,
  provider: LLMProvider,
  opts?: {
    forceRefresh?: boolean;
    fetchFn?: typeof fetch;
  },
) {
  const events = [];
  for await (const event of loadPaperWithTranslation(
    input,
    provider,
    {
      targetLang: "zh-CN",
      modelLabel: "test-model",
      forceRefresh: opts?.forceRefresh,
    },
    { fetchFn: opts?.fetchFn },
  )) {
    events.push(event);
  }
  return events;
}

beforeEach(async () => {
  await db.papers.clear();
});

describe("loadPaperReadonly", () => {
  it("assembles a valid PaperIR from fetch + clean pipeline", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.99999/": {
        status: 200,
        body: SAMPLE_HTML,
      },
    });

    const paper = await loadPaperReadonly("2401.99999", { fetchFn });

    expect(() => PaperIRSchema.parse(paper)).not.toThrow();
    expect(paper.arxivId).toBe("2401.99999");
    expect(paper.version).toBe("latest");
    expect(paper.modelUsed).toBe("none");
    expect(paper.title).toBe("Pipeline Test Paper");
    expect(paper.authors).toEqual(["Eve Researcher"]);
    expect(paper.abstract).toBe("A sample abstract for pipeline testing.");
    expect(paper.blocks.some((b) => b.type === "paragraph")).toBe(true);
    expect(paper.blocks.some((b) => b.type === "math" && b.math?.tex === "a+b")).toBe(
      true,
    );
    expect(typeof paper.createdAt).toBe("number");
    expect(paper.blocks.every((b) => b.translation === undefined)).toBe(true);
  });

  it("uses explicit version from input", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.99999v3/": {
        status: 200,
        body: SAMPLE_HTML,
      },
    });

    const paper = await loadPaperReadonly("2401.99999v3", { fetchFn });

    expect(paper.version).toBe("v3");
    expect(paper.arxivId).toBe("2401.99999");
  });

  it("throws InvalidArxivIdError for unparseable input", async () => {
    await expect(loadPaperReadonly("not-an-arxiv-id")).rejects.toThrow(
      InvalidArxivIdError,
    );
  });

  it("returns cached paper when offline", async () => {
    await savePaper({
      arxivId: "2401.99999",
      version: "latest",
      title: "Offline Cached",
      authors: ["Author"],
      abstract: "Abstract.",
      abstractBlocks: [],
      blocks: [{ id: "p1", type: "paragraph", content: "Body." }],
      references: [],
      createdAt: Date.now(),
      modelUsed: "cached-model",
    });

    const paper = await loadPaperReadonly("2401.99999", {
      isOnline: () => false,
      fetchFn: async () => {
        throw new Error("fetch should not run offline without cache");
      },
    });

    expect(paper.title).toBe("Offline Cached");
  });

  it("throws OfflineUncachedError when offline and paper is not cached", async () => {
    await expect(
      loadPaperReadonly("2401.99999", { isOnline: () => false }),
    ).rejects.toThrow(OfflineUncachedError);
  });
});

describe("loadPaperForDisplay", () => {
  it("returns cached paper without fetching", async () => {
    await savePaper({
      arxivId: "2401.99999",
      version: "latest",
      title: "Cached Only",
      authors: [],
      abstract: "Abstract",
      abstractBlocks: [],
      blocks: [{ id: "p1", type: "paragraph", content: "Body" }],
      references: [],
      createdAt: Date.now(),
      modelUsed: "cached",
    });

    const result = await loadPaperForDisplay("2401.99999", {
      fetchFn: async () => {
        throw new Error("fetch should not run");
      },
    });

    expect(result.kind).toBe("cache");
    expect(result.ir.title).toBe("Cached Only");
  });

  it("fetches readonly HTML when no cache exists", async () => {
    const fetchFn = mockFetchFn({
      "https://arxiv.org/html/2401.99999/": {
        status: 200,
        body: SAMPLE_HTML,
      },
    });

    const result = await loadPaperForDisplay("2401.99999", { fetchFn });

    expect(result.kind).toBe("readonly");
    expect(result.ir.title).toBe("Pipeline Test Paper");

    const stored = await getPaper("2401.99999", "latest");
    expect(stored?.title).toBe("Pipeline Test Paper");
  });
});

describe("loadPaperWithTranslation", () => {
  const fetchFn = mockFetchFn({
    "https://arxiv.org/html/2401.99999/": {
      status: 200,
      body: SAMPLE_HTML,
    },
  });

  it("returns cache-hit and skips fetch/LLM when paper is cached", async () => {
    const cached = {
      arxivId: "2401.99999",
      version: "latest",
      title: "Cached Paper",
      authors: ["Cached Author"],
      abstract: "Cached abstract.",
      abstractBlocks: [],
      blocks: [
        {
          id: "p-cached",
          type: "paragraph" as const,
          content: "Cached body.",
          translation: "缓存正文。",
        },
      ],
      references: [],
      createdAt: Date.now(),
      modelUsed: "cached-model",
    };
    await savePaper(cached);

    const failingFetch = async () => {
      throw new Error("fetch should not be called on cache hit");
    };

    const events = await collectTranslationProgress(
      "2401.99999",
      {
        id: "mock",
        chat() {
          throw new Error("LLM should not be called on cache hit");
        },
      },
      { fetchFn: failingFetch },
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("cache-hit");
    if (events[0]?.type === "cache-hit") {
      expect(events[0].ir.title).toBe("Cached Paper");
      expect(events[0].ir.modelUsed).toBe("cached-model");
    }
  });

  it("runs full pipeline and persists IR on cache miss", async () => {
    const provider = makeAutoTranslationProvider();
    const events = await collectTranslationProgress("2401.99999", provider, {
      fetchFn,
    });

    expect(events.some((event) => event.type === "structure")).toBe(true);
    expect(events.some((event) => event.type === "block-translated")).toBe(true);

    const last = events[events.length - 1];
    expect(last?.type).toBe("done");
    if (last?.type === "done") {
      expect(() => PaperIRSchema.parse(last.ir)).not.toThrow();
      expect(last.ir.modelUsed).toBe("test-model");
    }

    const stored = await getPaper("2401.99999", "latest");
    expect(stored).toBeDefined();
    expect(stored!.title).toBe("Pipeline Test Paper");
    expect(stored!.blocks.some((block) => block.translation?.startsWith("[译]"))).toBe(
      true,
    );
  });

  it("skips cache lookup when forceRefresh is true", async () => {
    await savePaper({
      arxivId: "2401.99999",
      version: "latest",
      title: "Stale Cache",
      authors: ["Old Author"],
      abstract: "Old abstract.",
      abstractBlocks: [],
      blocks: [{ id: "p-old", type: "paragraph", content: "Old." }],
      references: [],
      createdAt: Date.now(),
      modelUsed: "old-model",
    });

    let fetchCalls = 0;
    const countingFetch = async (
      url: string | URL | Request,
    ): Promise<Response> => {
      fetchCalls += 1;
      return fetchFn(url);
    };

    const events = await collectTranslationProgress(
      "2401.99999",
      makeAutoTranslationProvider(),
      { fetchFn: countingFetch, forceRefresh: true },
    );

    expect(events.some((event) => event.type === "cache-hit")).toBe(false);
    expect(fetchCalls).toBeGreaterThan(0);

    const last = events[events.length - 1];
    expect(last?.type).toBe("done");
    if (last?.type === "done") {
      expect(last.ir.title).toBe("Pipeline Test Paper");
      expect(last.ir.modelUsed).toBe("test-model");
    }

    const stored = await getPaper("2401.99999", "latest");
    expect(stored?.title).toBe("Pipeline Test Paper");
    expect(stored?.modelUsed).toBe("test-model");
  });

  it("persists structure before translation completes", async () => {
    const provider = makeAutoTranslationProvider();
    const controller = new AbortController();

    const run = (async () => {
      for await (const event of loadPaperWithTranslation(
        "2401.99999",
        provider,
        {
          targetLang: "zh-CN",
          modelLabel: "test-model",
          signal: controller.signal,
        },
        { fetchFn },
      )) {
        if (event.type === "structure") {
          controller.abort();
        }
      }
    })();

    await expect(run).rejects.toMatchObject({ name: "AbortError" });

    const stored = await getPaper("2401.99999", "latest");
    expect(stored).toBeDefined();
    expect(stored!.title).toBe("Pipeline Test Paper");
  });

  it("resumes translation from partial cache without refetching", async () => {
    await savePaper({
      arxivId: "2401.99999",
      version: "latest",
      title: "Partial Paper",
      authors: ["Author"],
      abstract: "Abstract.",
      abstractBlocks: [],
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: "Already translated.",
          translation: "已译段落。",
        },
        {
          id: "p2",
          type: "paragraph",
          content: "Still pending.",
        },
      ],
      references: [],
      createdAt: Date.now(),
      modelUsed: "old-model",
    });

    let fetchCalls = 0;
    const countingFetch = async (
      url: string | URL | Request,
    ): Promise<Response> => {
      fetchCalls += 1;
      return fetchFn(url);
    };

    const events = await collectTranslationProgress(
      "2401.99999",
      makeAutoTranslationProvider(),
      { fetchFn: countingFetch },
    );

    expect(fetchCalls).toBe(0);
    expect(events.some((event) => event.type === "cache-hit")).toBe(false);
    expect(events.some((event) => event.type === "structure")).toBe(true);

    const last = events[events.length - 1];
    expect(last?.type).toBe("done");
    if (last?.type === "done") {
      expect(last.ir.blocks.find((block) => block.id === "p1")?.translation).toBe(
        "已译段落。",
      );
      expect(last.ir.blocks.find((block) => block.id === "p2")?.translation).toMatch(
        /^\[译\]/,
      );
    }
  });

  it("throws OfflineUncachedError on cache miss while offline", async () => {
    const events: LoadPaperWithTranslationProgress[] = [];
    await expect(async () => {
      for await (const event of loadPaperWithTranslation(
        "2401.99999",
        makeAutoTranslationProvider(),
        { targetLang: "zh-CN", modelLabel: "test-model" },
        { fetchFn, isOnline: () => false },
      )) {
        events.push(event);
      }
    }).rejects.toThrow(OfflineUncachedError);
    expect(events).toHaveLength(0);
  });
});
