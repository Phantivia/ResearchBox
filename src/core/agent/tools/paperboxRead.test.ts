import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { putPaperEntry } from "@/db/paperEntries";
import { putProject } from "@/db/projects";
import { savePaper } from "@/db";
import type { Paper } from "@/core/paper";
import type { PaperIR } from "@/core/ir";
import type { AgentDeps } from "../types";
import { paperboxReadTool } from "./paperboxRead";

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
        content: "We propose transformers.",
      },
    ],
    blocks: [
      {
        id: "h-1",
        type: "heading",
        level: 1,
        content: "Introduction",
      },
      {
        id: "p-1",
        type: "paragraph",
        content: "Sequence modeling is hard.",
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
  input: Parameters<typeof paperboxReadTool.call>[0],
  deps: AgentDeps,
) {
  const gen = paperboxReadTool.call(input, deps);
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

describe("paperboxReadTool", () => {
  it("is read-only and concurrency-safe", () => {
    expect(paperboxReadTool.isReadOnly({ mode: "list", section: "meta" })).toBe(
      true,
    );
    expect(
      paperboxReadTool.isConcurrencySafe({ mode: "list", section: "meta" }),
    ).toBe(true);
  });

  it("checkPermissions always allows", async () => {
    const result = await paperboxReadTool.checkPermissions(
      { mode: "list", section: "meta" },
      makeDeps(PROJECT_ID),
    );
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { mode: "list", section: "meta" },
    });
  });

  it("lists paper entries for the active project", async () => {
    const base = Date.now();
    await putPaperEntry(
      makePaperEntry({ updatedAt: base + 100, createdAt: base + 100 }),
    );
    await putPaperEntry(
      makePaperEntry({
        routeId: "2401.99999",
        arxivId: "2401.99999",
        source: "2401.99999",
        title: "Second Paper",
        authors: ["Carol"],
        status: "ready",
        updatedAt: base + 200,
        createdAt: base + 200,
      }),
    );
    await putPaperEntry(
      makePaperEntry({
        projectId: "other-project",
        routeId: "2401.88888",
        arxivId: "2401.88888",
        source: "2401.88888",
        title: "Other Project Paper",
      }),
    );

    const data = await callTool({ mode: "list", section: "meta" }, makeDeps(PROJECT_ID));

    expect(data).toEqual({
      mode: "list",
      papers: [
        {
          routeId: "2401.99999",
          title: "Second Paper",
          authors: ["Carol"],
          status: "ready",
        },
        {
          routeId: "2401.12345",
          title: "Attention Is All You Need",
          authors: ["Alice", "Bob"],
          status: "done",
        },
      ],
    });
  });

  it("returns full block text from PaperIR.blocks for mode=paper section=full", async () => {
    await putPaperEntry(makePaperEntry());
    await savePaper(makePaperIr());

    const data = await callTool(
      { mode: "paper", routeId: "2401.12345", section: "full" },
      makeDeps(PROJECT_ID),
    );

    expect(data).toEqual({
      mode: "paper",
      routeId: "2401.12345",
      section: "full",
      abstractBlocks: [
        {
          id: "abs-1",
          type: "paragraph",
          content: "We propose transformers.",
        },
      ],
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 1,
          content: "Introduction",
        },
        {
          id: "p-1",
          type: "paragraph",
          content: "Sequence modeling is hard.",
        },
      ],
    });
  });

  it("throws when projectId is missing from deps", async () => {
    await expect(
      callTool({ mode: "list", section: "meta" }, makeDeps()),
    ).rejects.toThrow("No active project");
  });
});
