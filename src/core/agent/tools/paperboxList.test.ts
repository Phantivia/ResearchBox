import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { putPaperEntry } from "@/db/paperEntries";
import { putProject } from "@/db/projects";
import { savePaper } from "@/db";
import type { Paper } from "@/core/paper";
import type { PaperIR } from "@/core/ir";
import type { AgentDeps } from "../types";
import { paperboxListTool } from "./paperboxList";

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
    abstractBlocks: [],
    blocks: [],
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

async function callTool(deps: AgentDeps) {
  const gen = paperboxListTool.call({}, deps);
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
    name: "Test Project",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
});

describe("paperboxListTool", () => {
  it("is read-only and concurrency-safe", () => {
    expect(paperboxListTool.isReadOnly({})).toBe(true);
    expect(paperboxListTool.isConcurrencySafe({})).toBe(true);
  });

  it("checkPermissions always allows", async () => {
    const result = await paperboxListTool.checkPermissions({}, makeDeps(PROJECT_ID));
    expect(result).toEqual({ behavior: "allow", updatedInput: {} });
  });

  it("returns title, authors, abstract and provenance-tagged newMessages", async () => {
    const base = Date.now();
    await putPaperEntry(
      makePaperEntry({ updatedAt: base + 100, createdAt: base + 100 }),
    );
    await savePaper(makePaperIr());

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
    await savePaper(
      makePaperIr({
        arxivId: "2401.99999",
        version: "latest",
        title: "Second Paper",
        authors: ["Carol"],
        abstract: "<p>A second abstract.</p>",
      }),
    );

    const result = await callTool(makeDeps(PROJECT_ID));

    expect(result.data).toEqual({
      papers: [
        {
          routeId: "2401.99999",
          title: "Second Paper",
          authors: ["Carol"],
          abstract: "<p>A second abstract.</p>",
          status: "ready",
        },
        {
          routeId: "2401.12345",
          title: "Attention Is All You Need",
          authors: ["Alice", "Bob"],
          abstract: "<p>We propose transformers.</p>",
          status: "done",
        },
      ],
    });

    const text = result.newMessages?.[0]?.content[0];
    expect(text).toEqual({
      type: "text",
      text: expect.stringContaining("[来源: paperbox]"),
    });
    expect((text as { text: string }).text).toContain("Second Paper");
    expect((text as { text: string }).text).toContain("Attention Is All You Need");
    expect((text as { text: string }).text).toContain("We propose transformers.");
  });

  it("leaves abstract empty when PaperIR is missing", async () => {
    await putPaperEntry(makePaperEntry({ status: "processing" }));

    const result = await callTool(makeDeps(PROJECT_ID));

    expect(result.data.papers).toEqual([
      {
        routeId: "2401.12345",
        title: "Attention Is All You Need",
        authors: ["Alice", "Bob"],
        abstract: "",
        status: "processing",
      },
    ]);
  });

  it("throws when projectId is missing from deps", async () => {
    await expect(callTool(makeDeps())).rejects.toThrow("No active project");
  });
});
