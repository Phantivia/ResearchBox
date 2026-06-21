import { fetchWithRetry } from "../http";
import type { ChatOptions, LLMProvider, ProviderConfig } from "../types";
import { parseSSEStream } from "../sse";

type GeminiPart = { text?: string };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
};

type GeminiModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

type GeminiModelListResponse = {
  models?: GeminiModel[];
  nextPageToken?: string;
};

function buildUrl(baseURL: string, model: string, method: string): string {
  return `${baseURL.replace(/\/$/, "")}/models/${model}:${method}`;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };
}

function toGeminiContents(messages: ChatOptions["messages"]): GeminiContent[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
}

function extractText(response: GeminiResponse): string | undefined {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    return undefined;
  }
  return parts.map((part) => part.text ?? "").join("");
}

export class GeminiProvider implements LLMProvider {
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

  private buildBody(opts: ChatOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      contents: toGeminiContents(opts.messages),
      systemInstruction: { parts: [{ text: opts.system }] },
    };

    if (opts.json) {
      body.generationConfig = { responseMimeType: "application/json" };
    }

    return body;
  }

  private async completeChat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): Promise<string> {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const url = buildUrl(this.config.baseURL, this.config.model, "generateContent");

    const response = await fetchWithRetry(fetchFn, url, {
      method: "POST",
      headers: buildHeaders(this.config.apiKey),
      body: JSON.stringify(this.buildBody(opts)),
      signal: opts.signal,
    });

    const json = (await response.json()) as GeminiResponse;
    const text = extractText(json);
    if (text === undefined) {
      throw new Error("Gemini response missing content");
    }
    return text;
  }

  private async *streamChat(
    opts: ChatOptions,
    deps?: { fetchFn?: typeof fetch },
  ): AsyncIterable<string> {
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;
    const url = `${buildUrl(this.config.baseURL, this.config.model, "streamGenerateContent")}?alt=sse`;

    const response = await fetchWithRetry(fetchFn, url, {
      method: "POST",
      headers: buildHeaders(this.config.apiKey),
      body: JSON.stringify(this.buildBody(opts)),
      signal: opts.signal,
    });

    if (!response.body) {
      throw new Error("Gemini stream response missing body");
    }

    for await (const data of parseSSEStream(response.body)) {
      const parsed = JSON.parse(data) as GeminiResponse;
      const delta = extractText(parsed);
      if (delta) {
        yield delta;
      }
    }
  }
}

export async function listGeminiModels(
  config: ProviderConfig,
  deps?: { fetchFn?: typeof fetch },
): Promise<string[]> {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch;
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${config.baseURL.replace(/\/$/, "")}/models`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchWithRetry(fetchFn, url.toString(), {
      method: "GET",
      headers: { "x-goog-api-key": config.apiKey },
    });

    const json = (await response.json()) as GeminiModelListResponse;
    ids.push(
      ...(json.models ?? [])
        .filter(
          (model) =>
            !model.supportedGenerationMethods ||
            model.supportedGenerationMethods.includes("generateContent"),
        )
        .map((model) => model.name?.replace(/^models\//, ""))
        .filter((id): id is string => Boolean(id)),
    );

    pageToken = json.nextPageToken;
  } while (pageToken);

  return ids.sort();
}
