import { describe, it, expect } from "vitest";
import { PaperSchema } from "./schema";

describe("PaperSchema", () => {
  it("parses a valid paper", () => {
    const now = Date.now();
    const paper = PaperSchema.parse({
      projectId: "p-1",
      routeId: "2401.12345v2",
      importMethod: "arxiv-html",
      arxivId: "2401.12345",
      version: "v2",
      source: "https://arxiv.org/abs/2401.12345v2",
      title: "A Paper",
      authors: ["Alice"],
      status: "processing",
      createdAt: now,
      updatedAt: now,
    });

    expect(paper.routeId).toBe("2401.12345v2");
    expect(paper.status).toBe("processing");
  });

  it("applies defaults for importMethod/title/authors", () => {
    const now = Date.now();
    const paper = PaperSchema.parse({
      projectId: "p-1",
      routeId: "2401.99999",
      arxivId: "2401.99999",
      version: "latest",
      source: "2401.99999",
      status: "done",
      createdAt: now,
      updatedAt: now,
    });

    expect(paper.importMethod).toBe("arxiv-html");
    expect(paper.title).toBe("");
    expect(paper.authors).toEqual([]);
  });

  it("rejects an unknown status", () => {
    const now = Date.now();
    const result = PaperSchema.safeParse({
      projectId: "p-1",
      routeId: "x",
      arxivId: "x",
      version: "latest",
      source: "x",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    expect(result.success).toBe(false);
  });
});
