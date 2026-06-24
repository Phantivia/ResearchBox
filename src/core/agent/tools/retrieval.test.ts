import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db, savePaper } from "@/db";
import { putPaperEntry } from "@/db/paperEntries";
import { putProject } from "@/db/projects";
import type { Paper } from "@/core/paper";
import type { PaperIR } from "@/core/ir";
import type { LLMProvider } from "@/core/llm/types";
import type { AgentDeps } from "../types";
import { retrievalTool, retrievalInputSchema } from "./retrieval";

const PROJECT_ID = "proj-retrieval";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(timestamp: number): number {
  return Math.floor((Date.now() - timestamp) / MS_PER_DAY);
}

function makePaperEntry(overrides: Partial<Paper> = {}): Paper {
  const now = Date.now();
  return {
    projectId: PROJECT_ID,
    routeId: "2401.11111",
    importMethod: "arxiv-html",
    arxivId: "2401.11111",
    version: "latest",
    source: "2401.11111",
    title: "Transformer Paper",
    authors: ["Alice"],
    status: "done",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePaperIr(
  arxivId: string,
  version: string,
  blocks: PaperIR["blocks"],
  createdAt: number,
): PaperIR {
  return {
    arxivId,
    version,
    title: `${arxivId} title`,
    abstract: "<p>Abstract</p>",
    abstractBlocks: [],
    authors: ["Alice"],
    blocks,
    references: [],
    createdAt,
    modelUsed: "test-model",
  };
}

function mockLlm(ids: string[]): LLMProvider {
  return {
    id: "mock",
    chat: async () => JSON.stringify({ ids }),
  };
}

function makeDeps(llm: LLMProvider): AgentDeps {
  return {
    db,
    llm,
    store: {
      messages: [],
      pendingApprovals: [],
      runningTools: {},
      permissionMode: "default",
      append: () => {},
      enqueueApproval: () => {},
      setRunningTool: () => {},
      clearRunningTool: () => {},
    },
    signal: new AbortController().signal,
    requestApproval: async () => true,
    projectId: PROJECT_ID,
  };
}

async function callRetrieval(
  deps: AgentDeps,
  query: string,
  opts: { paperIds?: string[]; topK?: number } = {},
) {
  const input = retrievalInputSchema.parse({ query, topK: 5, ...opts });
  const gen = retrievalTool.call(input, deps);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

beforeEach(async () => {
  await db.paperEntries.clear();
  await db.papers.clear();
  await db.projects.clear();

  await putProject({
    id: PROJECT_ID,
    name: "Retrieval Test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
});

describe("retrievalTool", () => {
  it("is read-only and concurrency-safe", () => {
    expect(retrievalTool.isReadOnly({ query: "test", topK: 5 })).toBe(true);
    expect(retrievalTool.isConcurrencySafe({ query: "test", topK: 5 })).toBe(true);
  });

  it("checkPermissions always allows", async () => {
    const result = await retrievalTool.checkPermissions(
      { query: "transformer", topK: 5 },
      makeDeps(mockLlm([])),
    );
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { query: "transformer", topK: 5 },
    });
  });

  it("returns hits with citation and staleDays and provenance-tagged citation guidance", async () => {
    const recentCreatedAt = Date.now() - 30 * MS_PER_DAY;
    const staleCreatedAt = Date.now() - 200 * MS_PER_DAY;

    await putPaperEntry(makePaperEntry());
    await savePaper(
      makePaperIr("2401.11111", "latest", [
        { id: "p1", type: "paragraph", content: "<p>Transformer architecture.</p>" },
        { id: "p2", type: "paragraph", content: "<p>Attention mechanism.</p>" },
      ], recentCreatedAt),
    );

    await putPaperEntry(
      makePaperEntry({
        routeId: "2401.22222",
        arxivId: "2401.22222",
        source: "2401.22222",
        title: "Baseline Paper",
      }),
    );
    await savePaper(
      makePaperIr("2401.22222", "latest", [
        { id: "b1", type: "paragraph", content: "<p>Baseline experiment results.</p>" },
      ], staleCreatedAt),
    );

    const deps = makeDeps(
      mockLlm(["2401.11111:latest#p1", "2401.22222:latest#b1"]),
    );
    const result = await callRetrieval(deps, "transformer attention baseline");

    expect(result.data).toEqual([
      {
        blockId: "p1",
        paperId: "2401.11111:latest",
        citation: "2401.11111:latest#p1",
        text: "<p>Transformer architecture.</p>",
        staleDays: daysSince(recentCreatedAt),
      },
      {
        blockId: "b1",
        paperId: "2401.22222:latest",
        citation: "2401.22222:latest#b1",
        text: "<p>Baseline experiment results.</p>",
        staleDays: daysSince(staleCreatedAt),
      },
    ]);

    const messageText = result.newMessages?.[0]?.content[0];
    expect(messageText).toEqual({
      type: "text",
      text: expect.stringContaining("[来源: paperbox]"),
    });

    const text = (messageText as { text: string }).text;
    expect(text).toContain("2401.11111:latest#p1");
    expect(text).toContain("2401.22222:latest#b1");
    expect(text).toContain("paperId#blockId");
    expect(text).toContain("paperbox_fetch / paperbox_read");
    expect(text).toContain("2401.11111:latest → routeId: 2401.11111");
    expect(text).toContain("2401.22222:latest → routeId: 2401.22222");
    expect(text).toContain(`${daysSince(staleCreatedAt)} days old`);
    expect(text).not.toContain(`${daysSince(recentCreatedAt)} days old`);
  });

  it("respects paperIds filter when loading candidates", async () => {
    const createdAt = Date.now();
    await putPaperEntry(makePaperEntry());
    await savePaper(
      makePaperIr("2401.11111", "latest", [
        { id: "p1", type: "paragraph", content: "<p>Included block.</p>" },
      ], createdAt),
    );

    await putPaperEntry(
      makePaperEntry({
        routeId: "2401.22222",
        arxivId: "2401.22222",
        source: "2401.22222",
      }),
    );
    await savePaper(
      makePaperIr("2401.22222", "latest", [
        { id: "b1", type: "paragraph", content: "<p>Excluded block.</p>" },
      ], createdAt),
    );

    const deps = makeDeps(mockLlm(["2401.22222:latest#b1"]));
    const result = await callRetrieval(deps, "baseline", {
      paperIds: ["2401.11111:latest"],
    });

    expect(result.data).toEqual([
      {
        blockId: "p1",
        paperId: "2401.11111:latest",
        citation: "2401.11111:latest#p1",
        text: "<p>Included block.</p>",
        staleDays: 0,
      },
    ]);
  });
});
