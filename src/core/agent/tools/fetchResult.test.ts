import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { addToolResult, db } from "@/db";
import type { AgentDeps } from "../types";
import { fetchResultTool } from "./fetchResult";

function makeDeps(): AgentDeps {
  return {
    db,
    llm: { id: "fake", chat: () => Promise.resolve("") },
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

async function callFetchResult(deps: AgentDeps, resultId: string) {
  const gen = fetchResultTool.call({ resultId }, deps);
  let step = await gen.next();
  const progress: unknown[] = [];
  while (!step.done) {
    progress.push(step.value);
    step = await gen.next();
  }
  return { result: step.value, progress };
}

beforeEach(async () => {
  await db.toolResults.clear();
});

describe("fetchResultTool", () => {
  it("returns persisted content by resultId", async () => {
    const content = "full tool output payload";
    const resultId = await addToolResult({ content });
    const deps = makeDeps();

    const { result, progress } = await callFetchResult(deps, resultId);

    expect(progress).toEqual([{ stage: "loading persisted result" }]);
    expect(result.data).toEqual({ resultId, content });
  });

  it("throws when resultId is missing", async () => {
    const deps = makeDeps();
    const gen = fetchResultTool.call({ resultId: "missing-id" }, deps);
    await gen.next();
    await expect(gen.next()).rejects.toThrow(
      "No persisted tool result found for resultId: missing-id",
    );
  });
});
