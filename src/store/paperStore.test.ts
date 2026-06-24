import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { PaperIR } from "@/core/ir";
import { db } from "@/db";
import { usePaperStore } from "./paperStore";

const PROJECT_ID = "proj-paper-store";
const ROUTE_ID = "2401.12345";

const MOCK_IR: PaperIR = {
  arxivId: "2401.12345",
  version: "latest",
  title: "Test Paper",
  authors: ["Alice"],
  abstract: "An abstract.",
  abstractBlocks: [{ id: "abs-1", type: "paragraph", content: "An abstract." }],
  blocks: [{ id: "p-1", type: "paragraph", content: "Body text." }],
  references: [],
  createdAt: 1,
  modelUsed: "none",
};

describe("usePaperStore.recordPaper", () => {
  beforeEach(async () => {
    await db.papers.clear();
    await db.paperEntries.clear();
    usePaperStore.setState({ projectId: PROJECT_ID, papers: [], loaded: true });
  });

  it("persists PaperIR to the papers table", async () => {
    await usePaperStore.getState().recordPaper(PROJECT_ID, ROUTE_ID, MOCK_IR, "ready");

    const stored = await db.papers.get([MOCK_IR.arxivId, MOCK_IR.version]);
    expect(stored?.title).toBe("Test Paper");
    expect(stored?.blocks).toHaveLength(1);
  });
});
