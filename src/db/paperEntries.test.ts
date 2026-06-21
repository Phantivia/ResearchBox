import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./index";
import {
  putPaperEntry,
  getPaperEntry,
  listPaperEntries,
  deletePaperEntry,
  deletePaperEntriesForProject,
} from "./paperEntries";
import type { Paper } from "@/core/paper";

function makePaper(overrides: Partial<Paper> = {}): Paper {
  const now = Date.now();
  return {
    projectId: "p-1",
    routeId: "2401.12345",
    importMethod: "arxiv-html",
    arxivId: "2401.12345",
    version: "latest",
    source: "2401.12345",
    title: "Test Paper",
    authors: ["Alice"],
    status: "processing",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.paperEntries.clear();
});

describe("putPaperEntry / getPaperEntry", () => {
  it("persists and retrieves a paper by [projectId+routeId]", async () => {
    await putPaperEntry(makePaper());
    const stored = await getPaperEntry("p-1", "2401.12345");
    expect(stored?.title).toBe("Test Paper");
  });

  it("isolates the same routeId across projects", async () => {
    await putPaperEntry(makePaper({ projectId: "p-1", title: "In P1" }));
    await putPaperEntry(makePaper({ projectId: "p-2", title: "In P2" }));

    expect((await getPaperEntry("p-1", "2401.12345"))?.title).toBe("In P1");
    expect((await getPaperEntry("p-2", "2401.12345"))?.title).toBe("In P2");
    expect(await db.paperEntries.count()).toBe(2);
  });
});

describe("listPaperEntries", () => {
  it("returns only the project's papers sorted by updatedAt descending", async () => {
    await putPaperEntry(makePaper({ routeId: "a", arxivId: "a", updatedAt: 100 }));
    await putPaperEntry(makePaper({ routeId: "b", arxivId: "b", updatedAt: 300 }));
    await putPaperEntry(makePaper({ projectId: "p-2", routeId: "c", arxivId: "c" }));

    const list = await listPaperEntries("p-1");
    expect(list.map((p) => p.routeId)).toEqual(["b", "a"]);
  });
});

describe("delete helpers", () => {
  it("removes a single paper", async () => {
    await putPaperEntry(makePaper());
    await deletePaperEntry("p-1", "2401.12345");
    expect(await getPaperEntry("p-1", "2401.12345")).toBeUndefined();
  });

  it("removes all papers for a project", async () => {
    await putPaperEntry(makePaper({ routeId: "a", arxivId: "a" }));
    await putPaperEntry(makePaper({ routeId: "b", arxivId: "b" }));
    await putPaperEntry(makePaper({ projectId: "p-2", routeId: "c", arxivId: "c" }));

    await deletePaperEntriesForProject("p-1");
    expect(await listPaperEntries("p-1")).toHaveLength(0);
    expect(await listPaperEntries("p-2")).toHaveLength(1);
  });
});
