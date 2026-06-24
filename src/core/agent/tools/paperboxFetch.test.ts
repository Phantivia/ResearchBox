import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, savePaper } from "@/db";
import { putPaperEntry } from "@/db/paperEntries";
import { putProject } from "@/db/projects";
import type { PaperIR } from "@/core/ir";
import type { Paper } from "@/core/paper";
import type { AgentDeps } from "../types";
import { paperboxFetchTool } from "./paperboxFetch";

const PROJECT_ID = "proj-test";

function makePaperEntry(overrides: Partial<Paper> = {}): Paper {
  const now = Date.now();
  return {
    projectId: PROJECT_ID,
    routeId: "2401.12345",
    importMethod: "arxiv-html",
    arxivId: "2401.12345",
    version: "latest",
    source: "2401.12345",
    title: "Attention Is All You Need",
    authors: ["Alice", "Bob"],
    status: "done",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePaperIr(overrides: Partial<PaperIR> = {}): PaperIR {
  return {
    arxivId: "2401.12345",
    version: "latest",
    title: "Attention Is All You Need",
    authors: ["Alice", "Bob"],
    abstract: "<p>We propose transformers.</p>",
    abstractBlocks: [
      {
        id: "abs-1",
        type: "paragraph",
        content: "<p>We propose transformers.</p>",
      },
    ],
    blocks: [
      {
        id: "h-1",
        type: "heading",
        level: 1,
        content: "<h1>Introduction</h1>",
      },
      {
        id: "p-1",
        type: "paragraph",
        content: "<p>Sequence modeling is hard.</p>",
      },
    ],
    references: [],
    createdAt: Date.now(),
    modelUsed: "test-model",
    ...overrides,
  };
}

function makeDeps(projectId?: string): AgentDeps {
  return {
    db,
    llm: { id: "fake", chat: async () => "" },
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
    ...(projectId !== undefined ? { projectId } : {}),
  };
}

async function callTool(
  input: Parameters<typeof paperboxFetchTool.call>[0],
  deps: AgentDeps,
) {
  const gen = paperboxFetchTool.call(input, deps);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value.data;
}

beforeEach(async () => {
  await db.paperEntries.clear();
  await db.papers.clear();
  await db.projects.clear();

  await putProject({
    id: PROJECT_ID,
    name: "Test Project",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
});

describe("paperboxFetchTool", () => {
  it("is read-only and concurrency-safe", () => {
    expect(paperboxFetchTool.isReadOnly({ routeId: "2401.12345" })).toBe(true);
    expect(paperboxFetchTool.isConcurrencySafe({ routeId: "2401.12345" })).toBe(
      true,
    );
  });

  it("returns compact full text with block markers and stripped HTML", async () => {
    await putPaperEntry(makePaperEntry());
    await savePaper(makePaperIr());

    const text = await callTool({ routeId: "2401.12345" }, makeDeps(PROJECT_ID));

    expect(text).toContain("# Attention Is All You Need");
    expect(text).toContain("paperId: 2401.12345:latest");
    expect(text).toContain("[2401.12345:latest#abs-1] We propose transformers.");
    expect(text).toContain("[2401.12345:latest#h-1] Introduction");
    expect(text).toContain("[2401.12345:latest#p-1] Sequence modeling is hard.");
    expect(text).not.toContain("<p>");
  });

  it("throws when projectId is missing from deps", async () => {
    await expect(
      callTool({ routeId: "2401.12345" }, makeDeps()),
    ).rejects.toThrow("No active project");
  });
});
