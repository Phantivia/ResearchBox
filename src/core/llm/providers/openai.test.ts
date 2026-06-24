import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LLMError } from "../http";
import { listOpenAICompatibleModels, OpenAICompatibleProvider } from "./openai";

const CONFIG = {
  id: "openai",
  apiKey: "test-key",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o",
};

function streamFromString(body: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
}

describe("OpenAICompatibleProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns full string for non-streaming chat", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: "Hello world" } }],
      }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);
    const result = await provider.chat(
      { system: "You are helpful.", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    expect(result).toBe("Hello world");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(init.body as string) as {
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toEqual({ role: "system", content: "You are helpful." });
  });

  it("yields streamed token chunks", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const fetchFn = vi.fn(async () =>
      new Response(streamFromString(sse), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);
    const iterable = provider.chat(
      {
        system: "sys",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
      { fetchFn },
    );

    const chunks: string[] = [];
    for await (const chunk of iterable as AsyncIterable<string>) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hel", "lo"]);
  });

  it("yields reasoning_content as thinking chunks for deepseek streams", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" hard"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"9.8"}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const fetchFn = vi.fn(async () =>
      new Response(streamFromString(sse), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new OpenAICompatibleProvider({
      ...CONFIG,
      id: "deepseek",
      baseURL: "https://api.deepseek.com/v1",
      reasoningEffort: "medium",
    });
    const iterable = provider.chat(
      {
        system: "sys",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
      { fetchFn },
    );

    const chunks: Array<string | { type: "thinking"; text: string }> = [];
    for await (const chunk of iterable) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: "thinking", text: "think" },
      { type: "thinking", text: " hard" },
      "9.8",
    ]);
  });

  it("throws LLMError on 4xx without retrying", async () => {
    const fetchFn = vi.fn(async () =>
      new Response("invalid key", { status: 401 }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);

    await expect(
      provider.chat(
        { system: "sys", messages: [{ role: "user", content: "Hi" }] },
        { fetchFn },
      ),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).status).toBe(401);
      expect((err as LLMError).body).toBe("invalid key");
      return true;
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and succeeds", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response("server error", { status: 503 });
      }
      return Response.json({
        choices: [{ message: { content: "recovered" } }],
      });
    });

    const provider = new OpenAICompatibleProvider(CONFIG);
    const promise = provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("recovered");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("sets response_format when json is true", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);
    await provider.chat(
      {
        system: "sys",
        messages: [{ role: "user", content: "Hi" }],
        json: true,
      },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      response_format: { type: string };
    };
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("defaults reasoning_effort to low when unset", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);
    await provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { reasoning_effort?: string };
    expect(body.reasoning_effort).toBe("low");
  });

  it("sends the configured reasoning_effort level", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );

    const provider = new OpenAICompatibleProvider({
      ...CONFIG,
      reasoningEffort: "high",
    });
    await provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { reasoning_effort?: string };
    expect(body.reasoning_effort).toBe("high");
  });

  it("omits reasoning_effort when set to off", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );

    const provider = new OpenAICompatibleProvider({
      ...CONFIG,
      reasoningEffort: "off",
    });
    await provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { reasoning_effort?: string };
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("sends thinking disabled for deepseek when reasoning is off", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );

    const provider = new OpenAICompatibleProvider({
      ...CONFIG,
      id: "deepseek",
      baseURL: "https://api.deepseek.com/v1",
      reasoningEffort: "off",
    });
    await provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      reasoning_effort?: string;
      thinking?: { type: string };
    };
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("sends thinking enabled for deepseek when reasoning is on", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );

    const provider = new OpenAICompatibleProvider({
      ...CONFIG,
      id: "deepseek",
      baseURL: "https://api.deepseek.com/v1",
      reasoningEffort: "high",
    });
    await provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      reasoning_effort?: string;
      thinking?: { type: string };
    };
    expect(body.reasoning_effort).toBe("high");
    expect(body.thinking).toEqual({ type: "enabled" });
  });

  it("does not send thinking for non-deepseek providers", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );

    const provider = new OpenAICompatibleProvider({
      ...CONFIG,
      reasoningEffort: "off",
    });
    await provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { thinking?: unknown };
    expect(body.thinking).toBeUndefined();
  });
});

describe("listOpenAICompatibleModels", () => {
  it("returns sorted model ids", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    );

    const models = await listOpenAICompatibleModels(CONFIG, { fetchFn });

    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/models");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
  });
});
