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

export interface LLMProvider {
  id: string;
  chat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<string> | Promise<string>;
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
  openRouterMeta?: StoredOpenRouterModelMeta | null;
};
