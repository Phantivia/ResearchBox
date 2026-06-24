import { describe, it, expect } from "vitest";
import type { LLMProvider } from "@/core/llm/types";
import type { Candidate } from "./manifest";
import {
  capPoolForSideQuery,
  MAX_SIDE_QUERY_MANIFEST_CHARS,
  MAX_SIDE_QUERY_POOL,
  selectRelevantBlocks,
} from "./selectBlocks";

const FETCHED_AT = 1_700_000_000_000;

function makeCandidate(
  paperId: string,
  blockId: string,
  preview: string,
  heading?: string,
): Candidate {
  return {
    paperId,
    blockId,
    preview,
    fetchedAt: FETCHED_AT,
    ...(heading !== undefined ? { heading } : {}),
  };
}

function mockLlm(
  chatImpl: LLMProvider["chat"],
): LLMProvider {
  return {
    id: "mock",
    chat: chatImpl,
  };
}

const CANDIDATES: Candidate[] = [
  makeCandidate("2401.11111:v1", "p1", "Transformer architecture details.", "Methods"),
  makeCandidate("2401.11111:v1", "p2", "Attention mechanism overview.", "Intro"),
  makeCandidate("2401.22222:v1", "p3", "Baseline experiment results.", "Results"),
];

describe("selectRelevantBlocks", () => {
  it("returns valid ids from model JSON, truncated to topK", async () => {
    const llm = mockLlm(() =>
      Promise.resolve(
        JSON.stringify({
          ids: [
            "2401.11111:v1#p1",
            "2401.11111:v1#p2",
            "2401.22222:v1#p3",
          ],
        }),
      ),
    );

    const result = await selectRelevantBlocks({
      query: "transformer attention",
      candidates: CANDIDATES,
      llm,
      topK: 2,
      signal: new AbortController().signal,
    });

    expect(result).toEqual(["2401.11111:v1#p1", "2401.11111:v1#p2"]);
  });

  it("drops hallucinated ids not present in candidates", async () => {
    const llm = mockLlm(() =>
      Promise.resolve(
        JSON.stringify({
          ids: ["2401.11111:v1#p1", "9999.99999:v9#fake"],
        }),
      ),
    );

    const result = await selectRelevantBlocks({
      query: "transformer",
      candidates: CANDIDATES,
      llm,
      topK: 5,
      signal: new AbortController().signal,
    });

    expect(result).toEqual(["2401.11111:v1#p1"]);
  });

  it("falls back to ranked blocks when model output is not valid JSON", async () => {
    const llm = mockLlm(() => Promise.resolve("not json"));

    const result = await selectRelevantBlocks({
      query: "transformer",
      candidates: CANDIDATES,
      llm,
      topK: 5,
      signal: new AbortController().signal,
    });

    expect(result).toEqual(["2401.11111:v1#p1"]);
  });

  it("falls back to ranked blocks when chat throws", async () => {
    const llm = mockLlm(() => Promise.reject(new Error("network failure")));

    const result = await selectRelevantBlocks({
      query: "transformer",
      candidates: CANDIDATES,
      llm,
      topK: 5,
      signal: new AbortController().signal,
    });

    expect(result).toEqual(["2401.11111:v1#p1"]);
  });

  it("drains streamed chat chunks before parsing JSON", async () => {
    const llm = mockLlm(async function* () {
      yield '{"ids": ["';
      yield "2401.11111:v1#p2";
      yield '"]}';
    });

    const result = await selectRelevantBlocks({
      query: "attention",
      candidates: CANDIDATES,
      llm,
      topK: 5,
      signal: new AbortController().signal,
    });

    expect(result).toEqual(["2401.11111:v1#p2"]);
  });

  it("caps large pools before side-query", async () => {
    const manyCandidates: Candidate[] = Array.from({ length: 250 }, (_, index) =>
      makeCandidate(
        "2401.11111:v1",
        `b${index}`,
        index === 42
          ? "KernelBench Level 3 geometric mean speedup benchmark results."
          : "Unrelated filler content about unrelated topics.",
        index === 42 ? "Evaluation" : "Appendix",
      ),
    );

    let seenUserChars = 0;
    const llm = mockLlm((opts) => {
      seenUserChars = opts.messages[0]?.content.length ?? 0;
      return Promise.resolve(JSON.stringify({ ids: ["2401.11111:v1#b42"] }));
    });

    const result = await selectRelevantBlocks({
      query: "KernelBench benchmark speedup",
      candidates: manyCandidates,
      llm,
      topK: 5,
      signal: new AbortController().signal,
    });

    expect(result).toEqual(["2401.11111:v1#b42"]);
    expect(seenUserChars).toBeLessThanOrEqual(MAX_SIDE_QUERY_MANIFEST_CHARS + 200);
    const { pool, wasCapped } = capPoolForSideQuery(
      "KernelBench benchmark speedup",
      manyCandidates,
    );
    expect(wasCapped).toBe(true);
    expect(pool.length).toBeLessThanOrEqual(MAX_SIDE_QUERY_POOL);
  });
});
