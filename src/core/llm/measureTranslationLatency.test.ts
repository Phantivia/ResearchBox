import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@/core/llm";
import {
  buildSampleTranslationBlocks,
  DEFAULT_ABSTRACT_LATENCY_SAMPLE_CHARS,
  estimateTokensFromChars,
  measureTranslationStreamLatency,
} from "./measureTranslationLatency";

describe("buildSampleTranslationBlocks", () => {
  it("builds blocks near the requested character budget", () => {
    const blocks = buildSampleTranslationBlocks(1500);
    const totalChars = blocks.reduce((sum, block) => sum + block.content.length, 0);

    expect(totalChars).toBeGreaterThanOrEqual(1500);
    expect(blocks[0]?.id).toBe("bench-block-1");
  });
});

describe("measureTranslationStreamLatency", () => {
  it("records content TTFT separately from visible translation TTFT", async () => {
    const jsonPrefix = '{"translations":[{"id":"bench-block-1","translation":"';
    const jsonSuffix = '"}]}';
    const provider: LLMProvider = {
      id: "mock",
      chat: () =>
        (async function* () {
          await new Promise((resolve) => setTimeout(resolve, 20));
          yield jsonPrefix;
          await new Promise((resolve) => setTimeout(resolve, 20));
          yield "你好";
          yield jsonSuffix;
        })(),
    };

    const metrics = await measureTranslationStreamLatency(provider, {
      blocks: [{ id: "bench-block-1", content: "Hello world." }],
    });

    expect(metrics.ttftContentMs).not.toBeNull();
    expect(metrics.ttftTranslationMs).not.toBeNull();
    expect(metrics.ttftTranslationMs!).toBeGreaterThan(metrics.ttftContentMs!);
    expect(metrics.firstTranslationPreview).toBe("你好");
  });

  it("uses a full-abstract-sized sample by default", async () => {
    let capturedUser = "";

    const provider: LLMProvider = {
      id: "mock",
      chat: (opts) => {
        capturedUser = opts.messages[0]?.content ?? "";
        return (async function* () {
          yield '{"translations":[{"id":"bench-block-1","translation":"x"}]}';
        })();
      },
    };

    await measureTranslationStreamLatency(provider);

    expect(capturedUser.length).toBeGreaterThan(DEFAULT_ABSTRACT_LATENCY_SAMPLE_CHARS);
    expect(estimateTokensFromChars(capturedUser.length)).toBeGreaterThan(700);
  });

  it("records HTTP response timing via instrumented fetch", async () => {
    const provider: LLMProvider = {
      id: "mock",
      chat: (_opts, deps) =>
        (async function* () {
          await deps?.fetchFn?.("https://example.test/chat", { method: "POST" });
          yield '{"translations":[{"id":"bench-block-1","translation":"ok"}]}';
        })(),
    };

    const fetchFn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return new Response("{}", { status: 200 });
    });

    const metrics = await measureTranslationStreamLatency(
      provider,
      { blocks: [{ id: "bench-block-1", content: "Test." }] },
      { fetchFn: fetchFn as typeof fetch },
    );

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(metrics.timeToResponseMs).not.toBeNull();
    expect(metrics.timeToResponseMs!).toBeGreaterThanOrEqual(10);
  });
});
