import { fetchWithRetry } from "../http";
import { resolveDefaultReasoningEffort } from "../providerReasoning";
import {
  type ChatOptions,
  type LLMProvider,
  type ProviderConfig,
} from "../types";
import { parseSSEStream } from "../sse";

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
};

type OpenAIModelListResponse = {
  data?: Array<{ id?: string }>;
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

export class OpenAICompatibleProvider implements LLMProvider {
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
    if (content === undefined) {
      throw new Error("OpenAI response missing content");
    }
    return content;
  }

  private async *streamChat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<string> {
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
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        yield delta;
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
