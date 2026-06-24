import { z } from "zod";
import { createProvider } from "@/core/llm/createProvider";
import { providerConfigForSubAgent } from "@/core/llm/providerReasoning";
import type { LLMProvider } from "@/core/llm/types";
import { runAgent, type BatchExecutor } from "./loop";
import { executeBatched } from "./orchestrate";
import { fetchResultTool } from "./tools/fetchResult";
import { paperboxListTool } from "./tools/paperboxList";
import { paperboxReadTool } from "./tools/paperboxRead";
import { retrievalTool } from "./tools/retrieval";
import type {
  AgentDeps,
  AgentMessage,
  AgentStore,
  Terminal,
  Tool,
} from "./types";

export const subAgentInputSchema = z.strictObject({
  type: z.enum(["paper-summarizer", "reviewer"]),
  paperId: z.string().optional(),
  prompt: z.string(),
});

export type SubAgentInput = z.infer<typeof subAgentInputSchema>;

export type SubAgentType = SubAgentInput["type"];

export type SubAgentOutput = {
  type: SubAgentType;
  summary: string;
  terminalReason: Terminal["reason"];
};

type SubAgentDef = {
  systemPrompt: string;
  tools: Tool<z.ZodTypeAny, unknown>[];
  maxTurns: number;
};

const SUB_AGENT_MAX_TURNS = 8;

const runSubAgentTools: BatchExecutor = async function* (toolUses, tools, deps) {
  const calls = toolUses.map(({ id, name, input }) => ({ id, name, input }));
  const batch = executeBatched(calls, tools, deps);
  let step = await batch.next();
  while (!step.done) {
    step = await batch.next();
  }
  return step.value;
};

const PAPER_SUMMARIZER_SYSTEM_PROMPT = `You are a research paper summarization specialist for ResearchBox.

=== CRITICAL: READ-ONLY MODE — NO WRITES OR EXECUTION ===
You are STRICTLY PROHIBITED from creating artifacts, running Python, or modifying project state.
You may only read papers via paperbox_read and search content via retrieval.

Given the caller's message, use the tools available to complete the summarization task efficiently.
Complete the task fully — respond with a concise structured report covering key findings, methodology, and limitations.
The caller will relay this to the user, so include only essentials.

Guidelines:
- Use retrieval for targeted evidence; use paperbox_read for metadata, abstract, or outline when helpful.
- Spawn parallel tool calls when searching multiple sections.
- NEVER delegate understanding back to the caller — work from the paperId and specific questions provided.
- If paperId is missing when needed, state what is missing rather than guessing.

When complete, respond with a concise summary report.`;

const REVIEWER_SYSTEM_PROMPT = `You are a verification specialist for ResearchBox research outputs. Your job is not to confirm citations work — it is to try to break them.

=== CRITICAL: READ-ONLY MODE — DO NOT MODIFY ===
You are STRICTLY PROHIBITED from creating artifacts, running Python, or modifying any project state.
You may only use read-only retrieval tools to verify claims against source papers.

Failure patterns to avoid:
1. Verification avoidance: skipping checks because the draft "looks fine"
2. Being seduced by the first 80%: stopping after finding some matching citations without checking edge cases

Your process:
1. Parse the review request for specific claims, citations, and artifact references
2. For each claim, use retrieval and paperbox_read to find supporting or contradicting evidence
3. Flag missing citations, misattributed blockIds, stale snapshots, and unsupported assertions

=== OUTPUT FORMAT (REQUIRED) ===
Structure your final report as:

### Summary verdict
PASS | FAIL | PARTIAL — one-line rationale

### Checks performed
For each check:
**Claim verified:** ...
**Evidence found:** ...
**Result:** PASS | FAIL | INCONCLUSIVE

### Issues found
Bulleted list of specific problems with paperId#blockId references where applicable

When complete, respond with this structured verification report.`;

export const SUBAGENTS: Record<SubAgentType, SubAgentDef> = {
  "paper-summarizer": {
    systemPrompt: PAPER_SUMMARIZER_SYSTEM_PROMPT,
    tools: [paperboxReadTool, retrievalTool],
    maxTurns: SUB_AGENT_MAX_TURNS,
  },
  reviewer: {
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    tools: [paperboxReadTool, paperboxListTool, retrievalTool, fetchResultTool],
    maxTurns: SUB_AGENT_MAX_TURNS,
  },
};

/** Background sub-agents never self-approve high-risk operations. */
export const backgroundRequestApproval: AgentDeps["requestApproval"] = async () =>
  false;

function createIsolatedStore(): AgentStore {
  const messages: AgentMessage[] = [];
  const runningTools: AgentStore["runningTools"] = {};

  return {
    messages,
    pendingApprovals: [],
    runningTools,
    permissionMode: "ask",
    append(message) {
      messages.push(message);
    },
    enqueueApproval() {
      return undefined;
    },
    setRunningTool(id, info) {
      runningTools[id] = info;
    },
    clearRunningTool(id) {
      delete runningTools[id];
    },
  };
}

function resolveChildLlm(deps: AgentDeps): LLMProvider {
  if (deps.providerConfig) {
    return createProvider(providerConfigForSubAgent(deps.providerConfig));
  }
  return deps.llm;
}

export function buildSubAgentDeps(deps: AgentDeps): AgentDeps {
  return {
    ...deps,
    llm: resolveChildLlm(deps),
    store: createIsolatedStore(),
    requestApproval: backgroundRequestApproval,
  };
}

function buildUserMessage(input: SubAgentInput): AgentMessage {
  const sections = [input.prompt];
  if (input.paperId) {
    sections.push(`Target paperId: ${input.paperId}`);
  }
  return {
    role: "user",
    content: [{ type: "text", text: sections.join("\n\n") }],
  };
}

function extractAssistantText(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    const text = message.content
      .filter(
        (block): block is { type: "text"; text: string } => block.type === "text",
      )
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text) {
      return text;
    }
  }
  return "(sub-agent produced no text response)";
}

function formatTranscriptLine(message: AgentMessage): string {
  const parts = message.content.map((block) => {
    switch (block.type) {
      case "text":
        return block.text;
      case "thinking":
        return `[thinking] ${block.text}`;
      case "tool_use":
        return `[tool_use] ${block.name}(${JSON.stringify(block.input)})`;
      case "tool_result":
        return `[tool_result${block.isError ? " error" : ""}] ${block.content.slice(0, 500)}`;
      case "artifact_card":
        return `[artifact_card] ${block.title} (${block.kind})`;
      default:
        return "";
    }
  });
  return `[${message.role}] ${parts.filter(Boolean).join(" ")}`.trim();
}

function buildTranscriptAttachment(
  type: SubAgentType,
  messages: AgentMessage[],
): AgentMessage {
  const lines = [
    `## Sub-agent transcript (${type})`,
    "",
    ...messages.map(formatTranscriptLine),
  ];
  return {
    role: "user",
    uiHidden: true,
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

async function drainAgent(
  generator: AsyncGenerator<AgentMessage, Terminal>,
): Promise<{ messages: AgentMessage[]; terminal: Terminal }> {
  const messages: AgentMessage[] = [];
  let step = await generator.next();
  while (!step.done) {
    messages.push(step.value);
    step = await generator.next();
  }
  return { messages, terminal: step.value };
}

export const subAgentTool: Tool<typeof subAgentInputSchema, SubAgentOutput> = {
  name: "sub_agent",
  description: `Launch a specialized read-only sub-agent for paper summarization or adversarial citation review.

Never delegate understanding: you MUST provide paperId (when applicable) and a specific, concrete prompt — not "summarize based on your findings" or "verify as needed".

Types:
- paper-summarizer: efficient read-only summary via paperbox_read + retrieval (cheap model recommended)
- reviewer: adversarial verification of citations and claims — tries to disprove, not confirm (read-only retrieval only)

Returns a distilled summary plus a full transcript attachment for your context. Multiple sub-agents may run in parallel.`,
  inputSchema: subAgentInputSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: async (input) => ({
    behavior: "allow",
    updatedInput: input,
  }),
  async *call(input, deps) {
    yield { stage: `sub-agent:${input.type}` };

    const def = SUBAGENTS[input.type];
    const childDeps = buildSubAgentDeps(deps);
    const initialMessages = [buildUserMessage(input)];

    const { messages, terminal } = await drainAgent(
      runAgent(
        {
          messages: initialMessages,
          tools: def.tools,
          system: def.systemPrompt,
          maxTurns: def.maxTurns,
        },
        childDeps,
        runSubAgentTools,
      ),
    );

    const summary = extractAssistantText(messages);
    return {
      data: {
        type: input.type,
        summary,
        terminalReason: terminal.reason,
      },
      newMessages: [buildTranscriptAttachment(input.type, messages)],
    };
  },
};
