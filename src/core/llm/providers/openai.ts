import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { fetchWithRetry } from "../http";
import { resolveDefaultReasoningEffort } from "../providerReasoning";
import {
  type AssistantMessage,
  type ChatOptions,
  type ChatStreamChunk,
  type LLMProvider,
  type ProviderConfig,
  type StreamEvent,
  type ToolSchema,
} from "../types";
import { parseSSEStream } from "../sse";

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type OpenAIAgentChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OpenAIUserContentPart[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
      reasoning_content?: string;
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAIStreamToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      reasoning_content?: string;
      tool_calls?: OpenAIToolCall[];
    };
    delta?: {
      content?: string | null;
      reasoning_content?: string;
      tool_calls?: OpenAIStreamToolCallDelta[];
    };
  }>;
};

type OpenAIModelListResponse = {
  data?: Array<{ id?: string }>;
};

type ToolCallState = {
  id: string;
  name: string;
  argumentsBuffer: string;
  started: boolean;
};

function buildUrl(baseURL: string): string {
  return `${baseURL.replace(/\/$/, "")}/chat/completions`;
}

function buildModelsUrl(baseURL: string): string {
  return `${baseURL.replace(/\/$/, "")}/models`;
}

function buildMessages(
  system: string,
  messages: ChatOptions["messages"],
): OpenAIChatMessage[] {
  return [{ role: "system", content: system }, ...messages];
}

function blocksToText(
  blocks: ContentBlock[],
  type: "text" | "thinking",
): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: typeof type }> => block.type === type)
    .map((block) => block.text)
    .join("");
}

function toOpenAIUserContent(
  blocks: ContentBlock[],
): string | OpenAIUserContentPart[] {
  const images = blocks.filter(
    (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image",
  );
  const text = blocksToText(blocks, "text");

  if (images.length === 0) {
    return text;
  }

  const parts: OpenAIUserContentPart[] = [];
  if (text.length > 0) {
    parts.push({ type: "text", text });
  }

  for (const block of blocks) {
    if (block.type === "image") {
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${block.mediaType};base64,${block.data}`,
        },
      });
    }
  }

  return parts;
}

function toOpenAIAgentMessages(
  messages: AgentMessage[],
  includeReasoning: boolean,
): OpenAIAgentChatMessage[] {
  const result: OpenAIAgentChatMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      result.push({ role: "user", content: toOpenAIUserContent(message.content) });
      continue;
    }

    if (message.role === "assistant") {
      const text = blocksToText(message.content, "text");
      const thinking = blocksToText(message.content, "thinking");
      const toolUses = message.content.filter(
        (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
          block.type === "tool_use",
      );

      const assistant: Extract<OpenAIAgentChatMessage, { role: "assistant" }> = {
        role: "assistant",
        content: text.length > 0 ? text : null,
      };

      if (includeReasoning && thinking.length > 0) {
        assistant.reasoning_content = thinking;
      }

      if (toolUses.length > 0) {
        assistant.tool_calls = toolUses.map((toolUse) => ({
          id: toolUse.id,
          type: "function",
          function: {
            name: toolUse.name,
            arguments: JSON.stringify(toolUse.input ?? {}),
          },
        }));
      }

      result.push(assistant);
      continue;
    }

    for (const block of message.content) {
      if (block.type === "tool_result") {
        result.push({
          role: "tool",
          tool_call_id: block.toolUseId,
          content: block.content,
        });
      }
    }
  }

  return result;
}

function toOpenAITools(tools: ToolSchema[]): unknown[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function mapFinishReason(
  reason: string | null | undefined,
): AssistantMessage["stopReason"] {
  if (reason === "tool_calls") {
    return "tool_use";
  }
  if (reason === "length") {
    return "max_tokens";
  }
  return "end_turn";
}

function finalizeToolCall(state: ToolCallState): Extract<ContentBlock, { type: "tool_use" }> {
  let input: unknown = {};
  if (state.argumentsBuffer.length > 0) {
    try {
      input = JSON.parse(state.argumentsBuffer);
    } catch {
      input = {};
    }
  }
  return {
    type: "tool_use",
    id: state.id,
    name: state.name,
    input,
  };
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;

  constructor(private readonly config: ProviderConfig) {
    this.id = config.id;
  }

  chat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<ChatStreamChunk> | Promise<string> {
    if (opts.stream) {
      return this.streamChat(opts, deps);
    }
    return this.completeChat(opts, deps);
  }

  async *runWithTools(
    req: {
      messages: AgentMessage[];
      tools: ToolSchema[];
      system: string;
      model?: string;
      signal?: AbortSignal;
    },
    deps?: { fetchFn?: typeof fetch },
  ): AsyncGenerator<StreamEvent, AssistantMessage> {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const includeReasoning = this.config.id === "deepseek";
    const effort = resolveDefaultReasoningEffort(this.config);

    const body: Record<string, unknown> = {
      model: req.model ?? this.config.model,
      messages: [
        { role: "system", content: req.system },
        ...toOpenAIAgentMessages(req.messages, includeReasoning),
      ],
      tools: toOpenAITools(req.tools),
      stream: true,
    };

    if (effort !== "off") {
      body.reasoning_effort = effort;
    }

    if (this.config.id === "deepseek") {
      body.thinking = { type: effort === "off" ? "disabled" : "enabled" };
    }

    const serializedBody = JSON.stringify(body);
    const response = await fetchWithRetry(fetchFn, buildUrl(this.config.baseURL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: serializedBody,
      signal: req.signal,
    });

    if (!response.body) {
      throw new Error("OpenAI stream response missing body");
    }

    let textBuffer = "";
    let thinkingBuffer = "";
    const toolCallsByIndex = new Map<number, ToolCallState>();
    let stopReason: AssistantMessage["stopReason"] = "end_turn";

    for await (const data of parseSSEStream(response.body)) {
      const parsed = JSON.parse(data) as OpenAIChatCompletionResponse;
      const choice = parsed.choices?.[0];
      const delta = choice?.delta;

      if (choice?.finish_reason) {
        stopReason = mapFinishReason(choice.finish_reason);
      }

      if (!delta) {
        continue;
      }

      if (delta.reasoning_content) {
        thinkingBuffer += delta.reasoning_content;
        yield { type: "thinking_delta", text: delta.reasoning_content };
      }

      if (delta.content) {
        textBuffer += delta.content;
        yield { type: "text_delta", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const toolDelta of delta.tool_calls) {
          const index = toolDelta.index ?? 0;
          let state = toolCallsByIndex.get(index);

          if (!state && (toolDelta.id || toolDelta.function?.name)) {
            state = {
              id: toolDelta.id ?? "",
              name: toolDelta.function?.name ?? "",
              argumentsBuffer: "",
              started: false,
            };
            toolCallsByIndex.set(index, state);
          }

          if (!state) {
            continue;
          }

          if (toolDelta.id) {
            state.id = toolDelta.id;
          }
          if (toolDelta.function?.name) {
            state.name = toolDelta.function.name;
          }

          if (!state.started && state.id && state.name) {
            state.started = true;
            yield { type: "tool_use_start", id: state.id, name: state.name };
          }

          if (toolDelta.function?.arguments) {
            state.argumentsBuffer += toolDelta.function.arguments;
            if (state.id) {
              yield {
                type: "tool_use_input_delta",
                id: state.id,
                partialJson: toolDelta.function.arguments,
              };
            }
          }
        }
      }
    }

    const content: ContentBlock[] = [];
    if (thinkingBuffer.length > 0) {
      content.push({ type: "thinking", text: thinkingBuffer });
    }
    if (textBuffer.length > 0) {
      content.push({ type: "text", text: textBuffer });
    }

    const sortedToolCalls = [...toolCallsByIndex.entries()].sort(
      ([left], [right]) => left - right,
    );
    for (const [, state] of sortedToolCalls) {
      if (!state.id || !state.name) {
        continue;
      }
      content.push(finalizeToolCall(state));
      yield { type: "tool_use_stop", id: state.id };
    }

    if (stopReason === "end_turn" && sortedToolCalls.length > 0) {
      stopReason = "tool_use";
    }

    return { content, stopReason };
  }

  private buildBody(opts: ChatOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: buildMessages(opts.system, opts.messages),
      stream,
    };

    if (opts.json) {
      body.response_format = { type: "json_object" };
    }

    const effort = resolveDefaultReasoningEffort(this.config);
    if (effort !== "off") {
      body.reasoning_effort = effort;
    }

    if (this.config.id === "deepseek") {
      body.thinking = { type: effort === "off" ? "disabled" : "enabled" };
    }

    return body;
  }

  private async completeChat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): Promise<string> {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const body = this.buildBody(opts, false);

    const response = await fetchWithRetry(fetchFn, buildUrl(this.config.baseURL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const json = (await response.json()) as OpenAIChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content;
    if (content == null) {
      throw new Error("OpenAI response missing content");
    }
    return content;
  }

  private async *streamChat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<ChatStreamChunk> {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const body = this.buildBody(opts, true);

    const response = await fetchWithRetry(fetchFn, buildUrl(this.config.baseURL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!response.body) {
      throw new Error("OpenAI stream response missing body");
    }

    for await (const data of parseSSEStream(response.body)) {
      const parsed = JSON.parse(data) as OpenAIChatCompletionResponse;
      const delta = parsed.choices?.[0]?.delta;
      const reasoning = delta?.reasoning_content;
      if (reasoning) {
        yield { type: "thinking", text: reasoning };
      }
      const content = delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

export async function listOpenAICompatibleModels(
  config: ProviderConfig,
  deps?: { fetchFn?: typeof fetch },
): Promise<string[]> {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch;

  const response = await fetchWithRetry(fetchFn, buildModelsUrl(config.baseURL), {
    method: "GET",
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  const json = (await response.json()) as OpenAIModelListResponse;
  return (json.data ?? [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id))
    .sort();
}
