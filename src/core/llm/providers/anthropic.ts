import { fetchWithRetry } from "../http";
import type { ChatOptions, LLMProvider, ProviderConfig } from "../types";
import { parseSSEStream } from "../sse";

const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicStreamEvent = {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
  };
};

type AnthropicModelListResponse = {
  data?: Array<{ id?: string }>;
  has_more?: boolean;
  last_id?: string;
};

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
      max_tokens: 8192,
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
      max_tokens: 8192,
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
