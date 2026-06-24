import { describe, it, expect } from "vitest";
import type { AgentDeps } from "../types";
import { recommendPapersInputSchema } from "../recommendation/types";
import { recommendPapersTool } from "./recommendPapers";

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
  papers: { arxivId: string; title: string; abstract: string; reason: string }[],
) {
  const parsed = recommendPapersInputSchema.parse({ papers });
  const gen = recommendPapersTool.call(parsed, makeDeps());
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

describe("recommendPapersTool", () => {
  it("is read-only and concurrency-safe", () => {
    const input = {
      papers: [{ arxivId: "2401.12345", title: "Paper", abstract: "Abs", reason: "Relevant" }],
    };
    expect(recommendPapersTool.isReadOnly(input)).toBe(true);
    expect(recommendPapersTool.isConcurrencySafe(input)).toBe(true);
  });

  it("normalizes arxiv IDs and returns recommendations with provenance message", async () => {
    const result = await callTool([
      {
        arxivId: "https://arxiv.org/abs/2401.12345v2",
        title: "Attention Paper",
        abstract: "Transformer architecture.",
        reason: "Foundational for the topic.",
      },
      {
        arxivId: "2401.99999",
        title: "Follow-up",
        abstract: "Follow-up work.",
        reason: "Builds on the first paper.",
      },
    ]);

    expect(result.data).toEqual([
      {
        arxivId: "2401.12345v2",
        title: "Attention Paper",
        abstract: "Transformer architecture.",
        reason: "Foundational for the topic.",
      },
      {
        arxivId: "2401.99999",
        title: "Follow-up",
        abstract: "Follow-up work.",
        reason: "Builds on the first paper.",
      },
    ]);

    const text = result.newMessages?.[0]?.content[0];
    expect(text).toEqual({
      type: "text",
      text: expect.stringContaining("[来源: academic]"),
    });
    expect((text as { text: string }).text).toContain("2401.12345v2");
    expect((text as { text: string }).text).toContain("Foundational for the topic.");
  });

  it("rejects invalid arxiv IDs", async () => {
    await expect(
      callTool([{ arxivId: "not-an-id", title: "x", abstract: "x", reason: "y" }]),
    ).rejects.toThrow(/Invalid arXiv ID/);
  });

  it("description mentions curated recommendations and inclusion gate", () => {
    expect(recommendPapersTool.description).toContain("inclusion cards");
    expect(recommendPapersTool.description).toContain("NOT automatically added");
    expect(recommendPapersTool.description).toContain("Include");
  });
});
