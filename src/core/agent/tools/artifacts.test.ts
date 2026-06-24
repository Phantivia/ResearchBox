import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db, getArtifact } from "@/db";
import type { LLMProvider } from "@/core/llm/types";
import { resolvePermission } from "../approval";
import type { AgentDeps } from "../types";
import { artifactsTool, artifactsInputSchema } from "./artifacts";

const PROJECT_ID = "proj-artifacts";

function makeDeps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    db,
    llm: { id: "mock", chat: async () => "" } as LLMProvider,
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
    projectId: PROJECT_ID,
    ...overrides,
  };
}

async function drainCall(
  input: Parameters<typeof artifactsTool.call>[0],
  deps: AgentDeps,
) {
  const gen = artifactsTool.call(input, deps);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

beforeEach(async () => {
  await db.artifacts.clear();
});

describe("artifactsTool", () => {
  it("is a write tool that is not concurrency-safe", () => {
    const input = artifactsInputSchema.parse({
      kind: "summary",
      title: "Test",
      content: "Body",
    });
    expect(artifactsTool.isReadOnly(input)).toBe(false);
    expect(artifactsTool.isConcurrencySafe(input)).toBe(false);
  });

  it("checkPermissions returns ask with low risk", async () => {
    const input = artifactsInputSchema.parse({
      kind: "outline",
      title: "Lit Review Outline",
      content: "# Outline",
    });
    const perm = await artifactsTool.checkPermissions(input, makeDeps());
    expect(perm).toEqual({
      behavior: "ask",
      reason: "生成 Artifact: Lit Review Outline",
      risk: "low",
    });
  });

  it("call persists artifact and returns artifactId", async () => {
    const input = artifactsInputSchema.parse({
      kind: "compare-table",
      title: "Method Comparison",
      content: "| Paper | Method |\n|---|---|",
      sourceCitations: ["2401.12345:latest#blk-1"],
    });

    const result = await drainCall(input, makeDeps());

    expect(result.data.artifactId).toBeTruthy();
    expect(result.data.title).toBe("Method Comparison");
    expect(result.data.kind).toBe("compare-table");
    expect(result.data.summary).toContain("Method Comparison");
    expect(result.data.invalidCitations).toBeUndefined();

    expect(await db.artifacts.count()).toBe(1);
    const stored = await getArtifact(result.data.artifactId);
    expect(stored).toMatchObject({
      projectId: PROJECT_ID,
      kind: "compare-table",
      title: "Method Comparison",
      sourceCitations: ["2401.12345:latest#blk-1"],
    });

    const msg = result.newMessages?.[0];
    expect(msg?.uiHidden).toBe(true);
    expect(msg?.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(`id=${result.data.artifactId}`),
    });
  });

  it("warns on invalid citations but still saves the artifact", async () => {
    const input = artifactsInputSchema.parse({
      kind: "note",
      title: "Quick Note",
      content: "Notes",
      sourceCitations: ["2401.12345:latest#blk-1", "not-a-citation", "#only-block"],
    });

    const result = await drainCall(input, makeDeps());

    expect(result.data.invalidCitations).toEqual(["not-a-citation", "#only-block"]);
    expect(result.data.summary).toContain("paperId#blockId");
    expect(await db.artifacts.count()).toBe(1);

    const stored = await getArtifact(result.data.artifactId);
    expect(stored?.sourceCitations).toEqual(input.sourceCitations);
  });

  it("resolvePermission allows in default mode without calling requestApproval", async () => {
    const input = artifactsInputSchema.parse({
      kind: "summary",
      title: "Auto Allowed",
      content: "Body",
    });
    let approvalCalled = false;

    const allowed = await resolvePermission({
      tool: artifactsTool,
      input,
      deps: makeDeps({
        requestApproval: async () => {
          approvalCalled = true;
          return false;
        },
      }),
      mode: "default",
    });

    expect(allowed).toBe("allow");
    expect(approvalCalled).toBe(false);
  });

  it("resolvePermission denies in ask mode when user rejects approval", async () => {
    const input = artifactsInputSchema.parse({
      kind: "summary",
      title: "Denied Summary",
      content: "Body",
    });

    const allowed = await resolvePermission({
      tool: artifactsTool,
      input,
      deps: makeDeps({ requestApproval: async () => false }),
      mode: "ask",
    });

    expect(allowed).toBe("deny");
    expect(await db.artifacts.count()).toBe(0);
  });
});
