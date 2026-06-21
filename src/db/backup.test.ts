import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import type { PaperIR } from "@/core/ir";
import type { Paper } from "@/core/paper";
import type { Project } from "@/core/project";
import { parseBackup } from "@/core/storage";
import {
  db,
  getSettings,
  saveSettings,
  saveProviderConfig,
  savePaper,
  putProject,
  putPaperEntry,
  exportData,
  importData,
  deletePaperData,
  listCachedPapers,
} from "./index";

const PROJECT: Project = {
  id: "proj-1",
  name: "Project One",
  createdAt: 1,
  updatedAt: 2,
};

const PAPER: PaperIR = {
  arxivId: "2401.12345",
  version: "v1",
  title: "Test Paper",
  abstract: "An abstract.",
  abstractBlocks: [],
  authors: ["Alice"],
  blocks: [{ id: "b1", type: "paragraph", content: "Hello." }],
  references: [],
  createdAt: 10,
  modelUsed: "test-model",
};

const PAPER_ENTRY: Paper = {
  projectId: "proj-1",
  routeId: "2401.12345v1",
  importMethod: "arxiv-html",
  arxivId: "2401.12345",
  version: "v1",
  source: "2401.12345v1",
  title: "Test Paper",
  authors: ["Alice"],
  status: "done",
  createdAt: 10,
  updatedAt: 11,
};

async function seed(): Promise<void> {
  await putProject(PROJECT);
  await putPaperEntry(PAPER_ENTRY);
  await savePaper(PAPER);
  await db.annotations.add({
    projectId: "proj-1",
    paperId: "2401.12345:v1",
    blockId: "b1",
    startOffset: 0,
    endOffset: 5,
    quote: "Hello",
    note: "a note",
    createdAt: 20,
  });
  await db.aiSessions.add({
    paperId: "2401.12345:v1",
    messages: [{ role: "user", content: "hi" }],
    createdAt: 30,
  });
  await saveSettings({ activeProviderId: "openai", viewMode: "bilingual" });
  await saveProviderConfig({
    id: "openai",
    apiKey: "sk-secret",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o",
  });
}

async function clearAll(): Promise<void> {
  await Promise.all([
    db.projects.clear(),
    db.paperEntries.clear(),
    db.papers.clear(),
    db.annotations.clear(),
    db.aiSessions.clear(),
    db.settings.clear(),
    db.secrets.clear(),
  ]);
}

beforeEach(clearAll);

describe("exportData / importData round-trip", () => {
  it("restores all tables identically after export, clear, import", async () => {
    await seed();

    const before = {
      projects: await db.projects.toArray(),
      paperEntries: await db.paperEntries.toArray(),
      papers: await db.papers.toArray(),
      annotations: await db.annotations.toArray(),
      aiSessions: await db.aiSessions.toArray(),
      settings: await getSettings(),
      secrets: await db.secrets.toArray(),
    };

    const backup = await exportData({ includeSecrets: true });
    await clearAll();
    const result = await importData(backup, "overwrite");

    expect(result.papers).toBe(1);
    expect(result.annotations).toBe(1);
    expect(result.aiSessions).toBe(1);

    expect(await db.projects.toArray()).toEqual(before.projects);
    expect(await db.paperEntries.toArray()).toEqual(before.paperEntries);
    expect(await db.papers.toArray()).toEqual(before.papers);
    expect(await db.annotations.toArray()).toEqual(before.annotations);
    expect(await db.aiSessions.toArray()).toEqual(before.aiSessions);
    expect(await getSettings()).toEqual(before.settings);
    expect(await db.secrets.toArray()).toEqual(before.secrets);
  });

  it("survives a serialize → parse → import cycle", async () => {
    await seed();
    const json = JSON.stringify(await exportData({ includeSecrets: true }));
    await clearAll();

    const backup = parseBackup(json);
    await importData(backup, "overwrite");

    expect(await db.papers.get(["2401.12345", "v1"])).toEqual(PAPER);
  });

  it("excludes secrets by default", async () => {
    await seed();
    const backup = await exportData();
    expect(backup.secrets).toBeUndefined();
  });
});

describe("importData conflict strategy", () => {
  it("skips existing papers when strategy is skip", async () => {
    await seed();
    const backup = await exportData();

    await savePaper({ ...PAPER, title: "Locally Edited" });
    const result = await importData(backup, "skip");

    expect(result.papers).toBe(0);
    expect((await db.papers.get(["2401.12345", "v1"]))?.title).toBe("Locally Edited");
  });

  it("overwrites existing papers when strategy is overwrite", async () => {
    await seed();
    const backup = await exportData();

    await savePaper({ ...PAPER, title: "Locally Edited" });
    const result = await importData(backup, "overwrite");

    expect(result.papers).toBe(1);
    expect((await db.papers.get(["2401.12345", "v1"]))?.title).toBe("Test Paper");
  });
});

describe("import rejects invalid JSON", () => {
  it("throws before touching the database", async () => {
    expect(() => parseBackup("not valid json at all")).toThrow();
    expect(await db.papers.count()).toBe(0);
  });
});

describe("deletePaperData", () => {
  it("removes the paper IR and its annotations and ai sessions", async () => {
    await seed();

    await deletePaperData("2401.12345", "v1");

    expect(await db.papers.get(["2401.12345", "v1"])).toBeUndefined();
    expect(
      await db.annotations.where("paperId").equals("2401.12345:v1").count(),
    ).toBe(0);
    expect(
      await db.aiSessions.where("paperId").equals("2401.12345:v1").count(),
    ).toBe(0);
  });
});

describe("listCachedPapers", () => {
  it("returns a summary for each cached paper", async () => {
    await seed();
    const list = await listCachedPapers();
    expect(list).toEqual([
      { arxivId: "2401.12345", version: "v1", title: "Test Paper" },
    ]);
  });
});
