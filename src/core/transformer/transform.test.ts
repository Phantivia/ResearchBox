import { describe, it, expect } from "vitest";
import type { CleanResult } from "@/core/cleaner";
import type { ChatOptions, LLMProvider } from "@/core/llm";
import { PaperIRSchema } from "@/core/ir";
import { getTranslationDebugMetrics } from "./debugMetrics";
import { resumeTranslation, transformToIR } from "./transform";

function makeCleaned(overrides: Partial<CleanResult> = {}): CleanResult {
  return {
    title: "Test Paper",
    authors: ["Alice"],
    abstract: "An abstract.",
    abstractBlocks: [{ id: "abs-1", type: "paragraph", content: "An abstract." }],
    blocks: [
      { id: "h1", type: "heading", level: 2, content: "Introduction" },
      { id: "p1", type: "paragraph", content: "First paragraph." },
      { id: "m1", type: "math", content: "x^2", math: { tex: "x^2", display: false } },
      { id: "p2", type: "paragraph", content: "Second paragraph." },
    ],
    references: [{ id: "r1", label: "[1]", text: "Reference one." }],
    ...overrides,
  };
}

type MockHandlerResult =
  | string
  | Promise<string>
  | AsyncIterable<string>
  | Error;

function makeMockProvider(
  handler: (callIndex: number, opts: ChatOptions) => MockHandlerResult,
): LLMProvider {
  let callIndex = 0;
  return {
    id: "mock",
    chat(opts) {
      const result = handler(callIndex, opts);
      callIndex += 1;
      if (result instanceof Error) {
        return Promise.reject(result);
      }
      if (
        result !== null &&
        typeof result === "object" &&
        Symbol.asyncIterator in result
      ) {
        return result;
      }
      return Promise.resolve(result);
    },
  };
}

function makeBatchJson(translations: Array<{ id: string; translation: string }>) {
  return JSON.stringify({ translations });
}

async function* streamText(text: string, chunkSize = 3): AsyncIterable<string> {
  for (let index = 0; index < text.length; index += chunkSize) {
    yield text.slice(index, index + chunkSize);
  }
}

async function collectProgress(
  cleaned: CleanResult,
  provider: LLMProvider,
  opts?: Partial<Parameters<typeof transformToIR>[2]>,
) {
  const events = [];
  for await (const event of transformToIR(cleaned, provider, {
    targetLang: "zh-CN",
    modelLabel: "test-model",
    arxivId: "2401.00001",
    version: "v1",
    ...opts,
  })) {
    events.push(event);
  }
  return events;
}

describe("transformToIR", () => {
  it("yields structure first, then block translations, then valid done IR", async () => {
    const provider = makeMockProvider((_i, opts) => {
      if (opts.stream) {
        return streamText(
          makeBatchJson([
            { id: "abs-1", translation: "摘要。" },
            { id: "h1", translation: "引言" },
            { id: "p1", translation: "第一段。" },
            { id: "p2", translation: "第二段。" },
          ]),
        );
      }
      return makeBatchJson([
        { id: "abs-1", translation: "摘要。" },
        { id: "h1", translation: "引言" },
        { id: "p1", translation: "第一段。" },
        { id: "p2", translation: "第二段。" },
      ]);
    });

    const events = await collectProgress(makeCleaned(), provider);

    expect(events[0]?.type).toBe("structure");
    if (events[0]?.type === "structure") {
      expect(events[0].ir.blocks.every((b) => b.translation === undefined)).toBe(
        true,
      );
    }

    const translated = events.filter((e) => e.type === "block-translated");
    const translatedIds = new Set(
      translated.map((event) =>
        event.type === "block-translated" ? event.blockId : "",
      ),
    );
    expect(translatedIds).toEqual(new Set(["abs-1", "h1", "p1", "p2"]));

    const done = events[events.length - 1];
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(() => PaperIRSchema.parse(done.ir)).not.toThrow();
      expect(done.ir.modelUsed).toBe("test-model");
      expect(typeof done.ir.createdAt).toBe("number");
      expect(done.ir.blocks.find((b) => b.id === "p1")?.translation).toBe(
        "第一段。",
      );
      expect(done.ir.blocks.find((b) => b.id === "m1")?.translation).toBeUndefined();
    }
  });

  it("parses JSON wrapped in Markdown fences", async () => {
    const fenced = [
      "```json",
      makeBatchJson([
        { id: "h1", translation: "引言" },
        { id: "p1", translation: "第一段。" },
        { id: "p2", translation: "第二段。" },
      ]),
      "```",
    ].join("\n");

    const provider = makeMockProvider((_i, opts) =>
      opts.stream ? streamText(fenced) : fenced,
    );

    const events = await collectProgress(makeCleaned(), provider);
    const done = events[events.length - 1];
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.ir.blocks.find((b) => b.id === "p1")?.translation).toBe(
        "第一段。",
      );
    }
  });

  it("degrades a failed batch while keeping other translations", async () => {
    const cleaned = makeCleaned({
      abstractBlocks: [],
      blocks: [
        { id: "p0", type: "paragraph", content: "Warmup paragraph." },
        { id: "h1", type: "heading", level: 2, content: "Introduction" },
        { id: "p1", type: "paragraph", content: "First paragraph." },
        { id: "p2", type: "paragraph", content: "Second paragraph." },
      ],
    });

    const provider = makeMockProvider((i, opts) => {
      if (i === 0) {
        const json = makeBatchJson([{ id: "p0", translation: "预热段。" }]);
        return opts.stream ? streamText(json) : json;
      }
      return "not-json-at-all";
    });

    const events = await collectProgress(cleaned, provider);
    const done = events[events.length - 1];

    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(() => PaperIRSchema.parse(done.ir)).not.toThrow();
      expect(done.ir.blocks.find((b) => b.id === "p0")?.translation).toBe(
        "预热段。",
      );
      expect(done.ir.blocks.find((b) => b.id === "p2")?.meta?.translationMissing).toBe(
        true,
      );
    }
  });

  it("translates abstract blocks together with body blocks", async () => {
    const cleaned = makeCleaned({
      abstractBlocks: [{ id: "abs-1", type: "paragraph", content: "Abstract paragraph." }],
    });

    const provider = makeMockProvider((_i, opts) => {
      const json = makeBatchJson([
        { id: "abs-1", translation: "摘要段落。" },
        { id: "h1", translation: "引言" },
        { id: "p1", translation: "第一段。" },
        { id: "p2", translation: "第二段。" },
      ]);
      return opts.stream ? streamText(json) : json;
    });

    const events = await collectProgress(cleaned, provider);
    const done = events[events.length - 1];

    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.ir.abstractBlocks.find((b) => b.id === "abs-1")?.translation).toBe(
        "摘要段落。",
      );
    }
  });

  it("yields degraded when provider fails entirely", async () => {
    const provider = makeMockProvider(() => new Error("network down"));

    const events = await collectProgress(makeCleaned(), provider);
    const last = events[events.length - 1];

    expect(last?.type).toBe("degraded");
    if (last?.type === "degraded") {
      expect(() => PaperIRSchema.parse(last.ir)).not.toThrow();
      expect(last.ir.blocks.every((b) => b.translation === undefined)).toBe(true);
      expect(last.reason).toContain("network down");
    }
  });

  it("streams partial translations before batch completes", async () => {
    const provider = makeMockProvider((_i, opts) => {
      if (!opts.stream) {
        return makeBatchJson([{ id: "p1", translation: "流式译文。" }]);
      }
      return streamText(
        '{"translations":[{"id":"p1","translation":"流式译文。"}]}',
        2,
      );
    });

    const events = await collectProgress(makeCleaned(), provider);
    const translated = events.filter((event) => event.type === "block-translated");

    expect(translated.length).toBeGreaterThan(1);
    expect(translated.some((event) => event.translation.length < 6)).toBe(true);
    expect(translated[translated.length - 1]?.translation).toBe("流式译文。");
  });

  it("attaches translation debug metrics only when debug mode is enabled", async () => {
    const provider = makeMockProvider((_i, opts) => {
      const json = makeBatchJson([
        { id: "abs-1", translation: "摘要。" },
        { id: "h1", translation: "引言" },
        { id: "p1", translation: "第一段。" },
        { id: "p2", translation: "第二段。" },
      ]);
      return opts.stream ? streamText(json) : json;
    });

    const events = await collectProgress(makeCleaned(), provider, {
      debugMode: true,
    });
    const translated = events.find(
      (event) =>
        event.type === "block-translated" &&
        event.blockId === "p1" &&
        event.debugMetrics,
    );

    expect(translated?.type).toBe("block-translated");
    if (translated?.type === "block-translated") {
      expect(translated.debugMetrics?.blockId).toBe("p1");
      expect(translated.debugMetrics?.modelLabel).toBe("test-model");
      expect(translated.debugMetrics?.estimatedTotalTokens).toBeGreaterThan(0);
    }

    const done = events[events.length - 1];
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      const block = done.ir.blocks.find((item) => item.id === "p1");
      expect(block ? getTranslationDebugMetrics(block) : undefined).toMatchObject({
        blockId: "p1",
        providerId: "mock",
        targetLang: "zh-CN",
      });
    }

    const withoutDebug = await collectProgress(makeCleaned(), provider);
    const finalWithoutDebug = withoutDebug[withoutDebug.length - 1];
    expect(finalWithoutDebug?.type).toBe("done");
    if (finalWithoutDebug?.type === "done") {
      const block = finalWithoutDebug.ir.blocks.find((item) => item.id === "p1");
      expect(block ? getTranslationDebugMetrics(block) : undefined).toBeUndefined();
    }
  });

  it("sends all abstract and body blocks in a single LLM request", async () => {
    let callCount = 0;
    const seenBlockIds: string[][] = [];

    const provider = makeMockProvider((_i, opts) => {
      callCount += 1;
      const parsed = JSON.parse(opts.messages[0]?.content ?? "{}") as {
        blocks?: { id: string }[];
      };
      seenBlockIds.push((parsed.blocks ?? []).map((b) => b.id));
      const ids = (parsed.blocks ?? []).map((b) => b.id);
      const json = makeBatchJson(ids.map((id) => ({ id, translation: `[译] ${id}` })));
      return opts.stream ? streamText(json) : json;
    });

    const events = await collectProgress(makeCleaned(), provider);
    const done = events[events.length - 1];

    expect(callCount).toBe(1);
    // All translatable blocks (abs-1 + h1 + p1 + p2) arrive in one call
    expect(seenBlockIds[0]).toEqual(["abs-1", "h1", "p1", "p2"]);
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.ir.abstractBlocks[0]?.translation).toBe("[译] abs-1");
      expect(done.ir.blocks.find((b) => b.id === "p1")?.translation).toBe("[译] p1");
    }
  });

  it("does not write partial text to IR — only complete events update IR", async () => {
    const provider = makeMockProvider((_i, opts) => {
      if (!opts.stream) {
        return makeBatchJson([{ id: "p1", translation: "完整译文。" }]);
      }
      return streamText(
        '{"translations":[{"id":"p1","translation":"完整译文。"}]}',
        2,
      );
    });

    const cleaned = makeCleaned({
      abstractBlocks: [],
      blocks: [{ id: "p1", type: "paragraph", content: "Some paragraph." }],
    });

    const events = await collectProgress(cleaned, provider);

    // Partial events must have partial=true and must NOT have set IR translation
    const partials = events.filter(
      (e) => e.type === "block-translated" && e.partial === true,
    );
    expect(partials.length).toBeGreaterThan(0);

    // The complete event has partial=false and sets translation in IR
    const complete = events.find(
      (e) => e.type === "block-translated" && e.partial !== true,
    );
    expect(complete?.type).toBe("block-translated");
    if (complete?.type === "block-translated") {
      expect(complete.blockId).toBe("p1");
      expect(complete.translation).toBe("完整译文。");
    }

    const done = events[events.length - 1];
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.ir.blocks[0]?.translation).toBe("完整译文。");
    }
  });

  it("resume translation uses continue prompt with completed blocks in context", async () => {
    const seenMessages: { completed?: { id: string }[]; blocks?: { id: string }[] }[] = [];

    const provider = makeMockProvider((_i, opts) => {
      const parsed = JSON.parse(opts.messages[0]?.content ?? "{}") as {
        completed?: { id: string }[];
        blocks?: { id: string }[];
      };
      seenMessages.push(parsed);
      const ids = (parsed.blocks ?? []).map((b) => b.id);
      const json = makeBatchJson(ids.map((id) => ({ id, translation: `[译] ${id}` })));
      return opts.stream ? streamText(json) : json;
    });

    const cachedIr = {
      arxivId: "2401.00001",
      version: "v1",
      title: "Test Paper",
      authors: ["Alice"],
      abstract: "An abstract.",
      abstractBlocks: [
        { id: "abs-1", type: "paragraph" as const, content: "An abstract.", translation: "已译摘要。" },
      ],
      blocks: [
        { id: "h1", type: "heading" as const, level: 2, content: "Introduction", translation: "引言" },
        { id: "p1", type: "paragraph" as const, content: "First paragraph." },
        { id: "p2", type: "paragraph" as const, content: "Second paragraph." },
      ],
      references: [],
      createdAt: 0,
      modelUsed: "old-model",
    };

    const events = [];
    for await (const event of resumeTranslation(cachedIr as Parameters<typeof resumeTranslation>[0], provider, {
      targetLang: "zh-CN",
      modelLabel: "test-model",
    })) {
      events.push(event);
    }

    // Only pending blocks (p1, p2) should be in `blocks`; completed go in `completed`
    const msg = seenMessages[0];
    expect(msg?.blocks?.map((b) => b.id)).toEqual(["p1", "p2"]);
    expect(msg?.completed?.map((b) => b.id)).toEqual(["abs-1", "h1"]);

    const done = events[events.length - 1];
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      // Already-translated blocks preserved
      expect(done.ir.abstractBlocks[0]?.translation).toBe("已译摘要。");
      expect(done.ir.blocks.find((b) => b.id === "h1")?.translation).toBe("引言");
      // Newly translated
      expect(done.ir.blocks.find((b) => b.id === "p1")?.translation).toBe("[译] p1");
      expect(done.ir.blocks.find((b) => b.id === "p2")?.translation).toBe("[译] p2");
    }
  });
});
