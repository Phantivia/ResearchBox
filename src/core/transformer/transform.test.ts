import { describe, it, expect, vi } from "vitest";
import type { CleanResult } from "@/core/cleaner";
import type { ChatOptions, LLMProvider } from "@/core/llm";
import { PaperIRSchema } from "@/core/ir";
import { getTranslationDebugMetrics } from "./debugMetrics";
import { transformToIR } from "./transform";

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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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

  it("starts body translation after abstract stream begins and a 1s delay", async () => {
    vi.useFakeTimers();
    try {
      const startedBatches: string[][] = [];
      const releaseAbstract = deferred();
      const releaseBody = deferred();

      const provider = makeMockProvider((_i, opts) => {
        const parsed = JSON.parse(opts.messages[0]?.content ?? "{}") as {
          blocks?: { id: string }[];
        };
        const ids = (parsed.blocks ?? []).map((block) => block.id);
        startedBatches.push(ids);

        async function* delayedBatch() {
          yield '{"translations":';
          if (ids.includes("abs-1")) {
            await releaseAbstract.promise;
          } else {
            await releaseBody.promise;
          }
          yield makeBatchJson(ids.map((id) => ({ id, translation: `[译] ${id}` })));
        }

        return delayedBatch();
      });

      const iterator = transformToIR(makeCleaned(), provider, {
        targetLang: "zh-CN",
        modelLabel: "test-model",
      });

      const first = await iterator.next();
      expect(first.value?.type).toBe("structure");

      const nextEvent = iterator.next();
      await Promise.resolve();
      await Promise.resolve();

      expect(startedBatches).toEqual([["abs-1"]]);

      await vi.advanceTimersByTimeAsync(999);
      await Promise.resolve();
      expect(startedBatches).toEqual([["abs-1"]]);

      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(startedBatches).toEqual([
        ["abs-1"],
        ["h1", "p1", "p2"],
      ]);

      releaseAbstract.resolve();
      const abstractEvent = await nextEvent;
      expect(abstractEvent.value?.type).toBe("block-translated");
      if (abstractEvent.value?.type === "block-translated") {
        expect(abstractEvent.value.blockId).toBe("abs-1");
      }

      releaseBody.resolve();
      for await (const event of iterator) {
        if (event.type === "done") {
          expect(event.ir.abstractBlocks[0]?.translation).toBe("[译] abs-1");
          expect(event.ir.blocks.find((block) => block.id === "p1")?.translation).toBe(
            "[译] p1",
          );
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes preceding abstract blocks as context for the first body batch", async () => {
    const seenContextIds: string[][] = [];
    const provider = makeMockProvider((_i, opts) => {
      const parsed = JSON.parse(opts.messages[0]?.content ?? "{}") as {
        context?: { id: string }[];
        blocks?: { id: string }[];
      };
      if ((parsed.blocks ?? []).some((block) => block.id === "h1")) {
        seenContextIds.push((parsed.context ?? []).map((block) => block.id));
      }

      const ids = (parsed.blocks ?? []).map((block) => block.id);
      const json = makeBatchJson(
        ids.map((id) => ({ id, translation: `[译] ${id}` })),
      );
      return opts.stream ? streamText(json) : json;
    });

    await collectProgress(makeCleaned(), provider);
    expect(seenContextIds).toEqual([["abs-1"]]);
  });

  it("launches multiple body batches concurrently after abstract starts", async () => {
    vi.useFakeTimers();
    try {
      const startedBodyBatches: string[][] = [];
      const releaseBody = deferred();
      const cleaned = makeCleaned({
        blocks: [
          { id: "p1", type: "paragraph", content: `${"x".repeat(3500)}.` },
          { id: "p2", type: "paragraph", content: `${"y".repeat(3500)}.` },
        ],
      });

      const provider = makeMockProvider((_i, opts) => {
        const parsed = JSON.parse(opts.messages[0]?.content ?? "{}") as {
          blocks?: { id: string }[];
        };
        const ids = (parsed.blocks ?? []).map((block) => block.id);

        async function* delayedBatch() {
          if (ids.includes("abs-1")) {
            yield makeBatchJson([{ id: "abs-1", translation: "[译] abs-1" }]);
            return;
          }

          startedBodyBatches.push(ids);
          yield '{"translations":';
          await releaseBody.promise;
          yield makeBatchJson(ids.map((id) => ({ id, translation: `[译] ${id}` })));
        }

        return delayedBatch();
      });

      const iterator = transformToIR(cleaned, provider, {
        targetLang: "zh-CN",
        modelLabel: "test-model",
      });

      await iterator.next();
      const nextEvent = iterator.next();
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();

      expect(startedBodyBatches.length).toBe(2);
      expect(startedBodyBatches.flat().sort()).toEqual(["p1", "p2"]);

      releaseBody.resolve();
      await nextEvent;
      for await (const event of iterator) {
        if (event.type === "done") {
          expect(event.ir.blocks.find((block) => block.id === "p1")?.translation).toBe(
            "[译] p1",
          );
          expect(event.ir.blocks.find((block) => block.id === "p2")?.translation).toBe(
            "[译] p2",
          );
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
