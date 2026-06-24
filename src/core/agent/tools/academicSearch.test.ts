import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentDeps } from "../types";
import type { AcademicHit } from "../search/types";
import * as runAcademicSearchModule from "../search/runAcademicSearch";
import { academicSearchTool, academicSearchInputSchema } from "./academicSearch";

const MOCK_HITS: AcademicHit[] = [
  {
    arxivId: "2401.12345",
    title: "Attention Is All You Need",
    authors: ["Alice", "Bob"],
    abstract: "We propose the Transformer architecture.",
    source: "semantic-scholar",
  },
  {
    arxivId: "2401.99999",
    title: "Second Paper",
    authors: ["Carol"],
    abstract: "Another abstract.",
    source: "openalex",
    externalId: "W123",
  },
];

function makeDeps(): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
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
  };
}

async function callTool(
  input: { query: string; limit?: number },
  deps: AgentDeps,
) {
  const parsed = academicSearchInputSchema.parse(input);
  const gen = academicSearchTool.call(parsed, deps);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

describe("academicSearchTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is read-only and concurrency-safe", () => {
    expect(
      academicSearchTool.isReadOnly({ query: "transformer", limit: 10 }),
    ).toBe(true);
    expect(
      academicSearchTool.isConcurrencySafe({ query: "transformer", limit: 10 }),
    ).toBe(true);
  });

  it("checkPermissions always allows", async () => {
    const result = await academicSearchTool.checkPermissions(
      { query: "transformer", limit: 10 },
      makeDeps(),
    );
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { query: "transformer", limit: 10 },
    });
  });

  it("returns hits and provenance-tagged newMessages with inclusion gate wording", async () => {
    const runSpy = vi
      .spyOn(runAcademicSearchModule, "runAcademicSearch")
      .mockResolvedValue(MOCK_HITS);

    const result = await callTool(
      { query: "transformer", limit: 10 },
      makeDeps(),
    );

    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "transformer",
        limit: 10,
      }),
    );
    expect(result.data).toEqual(MOCK_HITS);

    const text = result.newMessages?.[0]?.content[0];
    expect(text).toEqual({
      type: "text",
      text: expect.stringContaining("[来源: academic]"),
    });

    const body = (text as { text: string }).text;
    expect(body).toContain("recommend_papers");
    expect(body).toContain("2401.12345");
    expect(body).toContain("Attention Is All You Need");
    expect(body).toContain("Alice, Bob");
    expect(body).toContain("We propose the Transformer architecture.");
    expect(body).toContain("2401.99999");
    expect(body).toContain("Second Paper");
  });

  it("description points agent to recommend_papers and notes arxiv HTML limitation", () => {
    expect(academicSearchTool.description).toContain("recommend_papers");
    expect(academicSearchTool.description).toContain("Include");
    expect(academicSearchTool.description).toContain("arXiv HTML");
  });
});
