import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { fetchWithRetry } from "../http";
import type {
  AssistantMessage,
  ChatOptions,
  LLMProvider,
  ProviderConfig,
  StreamEvent,
  ToolSchema,
} from "../types";
import { parseSSEStream } from "../sse";

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 8192;

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicAgentMessage = {
  role: "user" | "assistant";
  content: unknown;
};

type AnthropicStreamEvent = {
  type?: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    text?: string;
    thinking?: string;
    input?: unknown;
  };
};

type AnthropicModelListResponse = {
  data?: Array<{ id?: string }>;
  has_more?: boolean;
  last_id?: string;
};

type BlockState =
  | { kind: "text"; buffer: string }
  | { kind: "thinking"; buffer: string }
  | { kind: "tool_use"; id: string; name: string; buffer: string };

function buildUrl(baseURL: string): string {
  return `${baseURL.replace(/\/$/, "")}/v1/messages`;
}

function buildModelsUrl(baseURL: string): string {
  return `${baseURL.replace(/\/$/, "")}/v1/models`;
}

function buildModelListHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

function toAnthropicMessages(
  messages: ChatOptions["messages"],
): AnthropicMessage[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}

function mapContentBlockToAnthropic(block: ContentBlock): unknown {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "image":
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: block.mediaType,
          data: block.data,
        },
      };
    case "thinking":
      return { type: "thinking", thinking: block.text };
    case "tool_use":
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      };
    case "tool_result": {
      const result: Record<string, unknown> = {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
      };
      if (block.isError !== undefined) {
        result.is_error = block.isError;
      }
      return result;
    }
  }
}

function toAnthropicAgentMessages(
  messages: AgentMessage[],
): AnthropicAgentMessage[] {
  return messages.map((message) => {
    const content = message.content.map(mapContentBlockToAnthropic);
    if (message.role === "assistant") {
      return { role: "assistant", content };
    }
    return { role: "user", content };
  });
}

function toAnthropicTools(tools: ToolSchema[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

function mapStopReason(
  reason: string | null | undefined,
): AssistantMessage["stopReason"] {
  if (reason === "tool_use" || reason === "max_tokens") {
    return reason;
  }
  return "end_turn";
}

function finalizeBlock(state: BlockState): ContentBlock | null {
  switch (state.kind) {
    case "text":
      return state.buffer.length > 0
        ? { type: "text", text: state.buffer }
        : null;
    case "thinking":
      return state.buffer.length > 0
        ? { type: "thinking", text: state.buffer }
        : null;
    case "tool_use":
      return {
        type: "tool_use",
        id: state.id,
        name: state.name,
        input: state.buffer.length > 0 ? JSON.parse(state.buffer) : {},
      };
  }
}

export class AnthropicProvider implements LLMProvider {
  readonly id: string;

  constructor(private readonly config: ProviderConfig) {
    this.id = config.id;
  }

  chat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<string> | Promise<string> {
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
    const body: Record<string, unknown> = {
      model: req.model ?? this.config.model,
      max_tokens: MAX_TOKENS,
      system: req.system,
      messages: toAnthropicAgentMessages(req.messages),
      tools: toAnthropicTools(req.tools),
      stream: true,
    };

    const response = await fetchWithRetry(fetchFn, buildUrl(this.config.baseURL), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!response.body) {
      throw new Error("Anthropic stream response missing body");
    }

    const blocksByIndex = new Map<number, BlockState>();
    const finalContent: ContentBlock[] = [];
    let stopReason: AssistantMessage["stopReason"] = "end_turn";

    for await (const data of parseSSEStream(response.body)) {
      const parsed = JSON.parse(data) as AnthropicStreamEvent;

      if (parsed.type === "content_block_start" && parsed.content_block) {
        const block = parsed.content_block;
        const index = parsed.index ?? 0;

        if (block.type === "text") {
          blocksByIndex.set(index, { kind: "text", buffer: block.text ?? "" });
        } else if (block.type === "thinking") {
          blocksByIndex.set(index, {
            kind: "thinking",
            buffer: block.thinking ?? "",
          });
        } else if (
          block.type === "tool_use" &&
          block.id &&
          block.name
        ) {
          blocksByIndex.set(index, {
            kind: "tool_use",
            id: block.id,
            name: block.name,
            buffer: "",
          });
          yield { type: "tool_use_start", id: block.id, name: block.name };
        }
        continue;
      }

      if (parsed.type === "content_block_delta" && parsed.delta) {
        const index = parsed.index ?? 0;
        const state = blocksByIndex.get(index);
        const delta = parsed.delta;

        if (delta.type === "text_delta" && delta.text) {
          if (state?.kind === "text") {
            state.buffer += delta.text;
          }
          yield { type: "text_delta", text: delta.text };
        } else if (delta.type === "thinking_delta" && delta.thinking) {
          if (state?.kind === "thinking") {
            state.buffer += delta.thinking;
          }
          yield { type: "thinking_delta", text: delta.thinking };
        } else if (
          delta.type === "input_json_delta" &&
          delta.partial_json !== undefined
        ) {
          if (state?.kind === "tool_use") {
            state.buffer += delta.partial_json;
            yield {
              type: "tool_use_input_delta",
              id: state.id,
              partialJson: delta.partial_json,
            };
          }
        }
        continue;
      }

      if (parsed.type === "content_block_stop") {
        const index = parsed.index ?? 0;
        const state = blocksByIndex.get(index);
        if (state) {
          const block = finalizeBlock(state);
          if (block) {
            finalContent.push(block);
          }
          if (state.kind === "tool_use") {
            yield { type: "tool_use_stop", id: state.id };
          }
          blocksByIndex.delete(index);
        }
        continue;
      }

      if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
        stopReason = mapStopReason(parsed.delta.stop_reason);
      }
    }

    return { content: finalContent, stopReason };
  }

  private buildHeaders(): Record<string, string> {
    return {
      "x-api-key": this.config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
      // Required for direct browser calls; keys stay local but CORS policy needs this opt-in.
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }

  private async completeChat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): Promise<string> {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: MAX_TOKENS,
      system: opts.system,
      messages: toAnthropicMessages(opts.messages),
      stream: false,
    };

    const response = await fetchWithRetry(fetchFn, buildUrl(this.config.baseURL), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const json = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = json.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    if (text === undefined) {
      throw new Error("Anthropic response missing content");
    }
    return text;
  }

  private async *streamChat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<string> {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: MAX_TOKENS,
      system: opts.system,
      messages: toAnthropicMessages(opts.messages),
      stream: true,
    };

    const response = await fetchWithRetry(fetchFn, buildUrl(this.config.baseURL), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!response.body) {
      throw new Error("Anthropic stream response missing body");
    }

    for await (const data of parseSSEStream(response.body)) {
      const parsed = JSON.parse(data) as AnthropicStreamEvent;
      if (
        parsed.type === "content_block_delta" &&
        parsed.delta?.type === "text_delta" &&
        parsed.delta.text
      ) {
        yield parsed.delta.text;
      }
    }
  }
}

export async function listAnthropicModels(
  config: ProviderConfig,
  deps?: { fetchFn?: typeof fetch },
): Promise<string[]> {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch;
  const ids: string[] = [];
  let afterId: string | undefined;

  do {
    const url = new URL(buildModelsUrl(config.baseURL));
    url.searchParams.set("limit", "1000");
    if (afterId) {
      url.searchParams.set("after_id", afterId);
    }

    const response = await fetchWithRetry(fetchFn, url.toString(), {
      method: "GET",
      headers: buildModelListHeaders(config.apiKey),
    });

    const json = (await response.json()) as AnthropicModelListResponse;
    ids.push(
      ...(json.data ?? [])
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id)),
    );

    if (!json.has_more || !json.last_id) {
      break;
    }
    afterId = json.last_id;
  } while (true);

  return ids.sort();
}
