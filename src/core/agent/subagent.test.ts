import { describe, expect, it } from "vitest";
import type { AssistantMessage, LLMProvider } from "@/core/llm/types";
import { resolvePermission } from "./approval";
import {
  buildSubAgentDeps,
  SUBAGENTS,
  subAgentTool,
} from "./subagent";
import type { AgentDeps, AgentMessage } from "./types";
import { artifactsTool } from "./tools/artifacts";
import { pythonTool } from "./tools/python";

async function drainTool<O>(
  gen: AsyncGenerator<unknown, { data: O; newMessages?: AgentMessage[] }>,
): Promise<{ data: O; newMessages?: AgentMessage[] }> {
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

function createScriptedLLM(replies: AssistantMessage[]) {
  let callIndex = 0;
  let lastToolNames: string[] = [];

  const runWithTools: LLMProvider["runWithTools"] = async function* (req) {
    lastToolNames = req.tools.map((tool) => tool.name);
    const reply = replies[callIndex] ?? replies[replies.length - 1];
    callIndex += 1;
    if (!reply) {
      throw new Error("scriptedLLM: no reply configured");
    }
    return reply;
  };

  return {
    runWithTools,
    getLastToolNames: () => lastToolNames,
  };
}

function makeDeps(
  runWithTools: LLMProvider["runWithTools"],
  overrides: Partial<AgentDeps> = {},
): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
    llm: {
      id: "fake",
      chat: () => Promise.resolve(""),
      runWithTools,
    },
    store: {
      messages: [],
      pendingApprovals: [],
      runningTools: {},
      permissionMode: "default",
      append: () => undefined,
      enqueueApproval: () => undefined,
      setRunningTool: () => undefined,
      clearRunningTool: () => undefined,
    },
    signal: new AbortController().signal,
    requestApproval: async () => true,
    ...overrides,
  };
}

const textReply = (text: string): AssistantMessage => ({
  content: [{ type: "text", text }],
  stopReason: "end_turn",
});

describe("subAgentTool", () => {
  it("paper-summarizer runs with narrowed tool pool and returns distilled summary", async () => {
    const { runWithTools, getLastToolNames } = createScriptedLLM([
      textReply("Methods: transformer architecture with sparse attention."),
    ]);
    const deps = makeDeps(runWithTools);

    const result = await drainTool(
      subAgentTool.call(
        {
          type: "paper-summarizer",
          paperId: "2401.12345",
          prompt: "Summarize the methodology section.",
        },
        deps,
      ),
    );

    expect(getLastToolNames()).toEqual(["paperbox_read", "paperbox_fetch", "retrieval"]);
    expect(result.data.type).toBe("paper-summarizer");
    expect(result.data.summary).toContain("Methods:");
    expect(result.data.terminalReason).toBe("completed");
  });

  it("reviewer childDeps always denies requestApproval for high-risk tools", async () => {
    const childDeps = buildSubAgentDeps(makeDeps(undefined));
    expect(childDeps.store.permissionMode).toBe("ask");
    expect(
      await childDeps.requestApproval({
        tool: "python",
        input: { code: "print(1)", purpose: "plot" },
        reason: "execute Python",
        risk: "high",
      }),
    ).toBe(false);

    const reviewerToolNames = SUBAGENTS.reviewer.tools.map((tool) => tool.name);
    expect(reviewerToolNames).not.toContain(pythonTool.name);
    expect(reviewerToolNames).not.toContain(artifactsTool.name);

    const pythonDecision = await resolvePermission({
      tool: pythonTool,
      input: { code: "print(1)", purpose: "plot" },
      deps: childDeps,
      mode: childDeps.store.permissionMode,
    });
    expect(pythonDecision).toBe("deny");
  });

  it("returns transcript attachment in newMessages", async () => {
    const { runWithTools } = createScriptedLLM([
      textReply("Verdict: PARTIAL — two citations could not be verified."),
    ]);
    const deps = makeDeps(runWithTools);

    const result = await drainTool(
      subAgentTool.call(
        {
          type: "reviewer",
          prompt: "Verify claim: attention scales linearly with sequence length.",
        },
        deps,
      ),
    );

    expect(result.newMessages).toHaveLength(1);
    const transcript = result.newMessages![0]!;
    expect(transcript.uiHidden).toBe(true);
    expect(transcript.content[0]).toMatchObject({
      type: "text",
    });
    const textBlock = transcript.content[0] as { type: "text"; text: string };
    expect(textBlock.text).toContain("Sub-agent transcript (reviewer)");
    expect(textBlock.text).toContain("[assistant]");
  });
});

describe("buildSubAgentDeps", () => {
  it("uses isolated message store separate from parent", () => {
    const parentMessages: AgentMessage[] = [];
    const parent = makeDeps(undefined, {
      store: {
        messages: parentMessages,
        pendingApprovals: [],
        runningTools: {},
        permissionMode: "default",
        append(message) {
          parentMessages.push(message);
        },
        enqueueApproval: () => undefined,
        setRunningTool: () => undefined,
        clearRunningTool: () => undefined,
      },
    });
    parent.store.append({
      role: "user",
      content: [{ type: "text", text: "parent message" }],
    });

    const child = buildSubAgentDeps(parent);
    child.store.append({
      role: "user",
      content: [{ type: "text", text: "child message" }],
    });

    expect(parent.store.messages).toHaveLength(1);
    expect(child.store.messages).toHaveLength(1);
    expect(child.store.messages[0]?.content[0]).toEqual({
      type: "text",
      text: "child message",
    });
  });
});
