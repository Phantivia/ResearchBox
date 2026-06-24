import type { AgentMessage, ContentBlock } from "@/core/agent/types";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  system: string;
  messages: Message[];
  stream?: boolean;
  json?: boolean;
  signal?: AbortSignal;
};

export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_input_delta"; id: string; partialJson: string }
  | { type: "tool_use_stop"; id: string };

export type AgentContentBlock = ContentBlock;

export type AssistantMessage = {
  content: AgentContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
};

export type ChatThinkingChunk = { type: "thinking"; text: string };

export type ChatStreamChunk = string | ChatThinkingChunk;

export function isChatThinkingChunk(
  chunk: ChatStreamChunk,
): chunk is ChatThinkingChunk {
  return typeof chunk === "object" && chunk.type === "thinking";
}

export function textFromChatStreamChunk(chunk: ChatStreamChunk): string {
  return typeof chunk === "string" ? chunk : "";
}

export interface LLMProvider {
  id: string;
  chat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<ChatStreamChunk> | Promise<string>;
  runWithTools?(
    req: {
      messages: AgentMessage[];
      tools: ToolSchema[];
      system: string;
      model?: string;
      signal?: AbortSignal;
    },
    deps?: { fetchFn?: typeof fetch },
  ): AsyncGenerator<StreamEvent, AssistantMessage>;
}

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";

export const DEFAULT_TRANSLATION_REASONING_EFFORT: ReasoningEffort = "off";

export const DEFAULT_SUB_AGENT_REASONING_EFFORT: ReasoningEffort = "off";

import type { StoredOpenRouterModelMeta } from "./openrouterSchema";

export type ProviderConfig = {
  id: string;
  apiKey: string;
  baseURL: string;
  model: string;
  /** Fallback reasoning effort for non-translation LLM calls (e.g. connection test). */
  reasoningEffort?: ReasoningEffort;
  /** Translation-specific reasoning effort; defaults to off when unset. */
  translationReasoningEffort?: ReasoningEffort;
  /** Sub-agent model override; falls back to `model` when unset. */
  subAgentModel?: string;
  /** Sub-agent reasoning effort; defaults to off when unset. */
  subAgentReasoningEffort?: ReasoningEffort;
  openRouterMeta?: StoredOpenRouterModelMeta | null;
};
