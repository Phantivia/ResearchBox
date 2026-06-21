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

export interface LLMProvider {
  id: string;
  chat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<string> | Promise<string>;
}

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";

export type ProviderConfig = {
  id: string;
  apiKey: string;
  baseURL: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
};
