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

describe("OpenAICompatibleProvider.runWithTools", () => {
  it("streams text, tool_calls deltas, and returns AssistantMessage", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Checking"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_test","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" \\"SF\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"finish_reason":"tool_calls","delta":{}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const fetchFn = vi.fn(async () =>
      new Response(streamFromString(sse), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);
    const generator = provider.runWithTools!(
      {
        system: "You are helpful.",
        messages: [{ role: "user", content: [{ type: "text", text: "Weather?" }] }],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            inputSchema: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
            },
          },
        ],
      },
      { fetchFn },
    );

    const events: import("../types").StreamEvent[] = [];
    let result = await generator.next();
    while (!result.done) {
      events.push(result.value);
      result = await generator.next();
    }

    expect(events).toEqual([
      { type: "text_delta", text: "Checking" },
      { type: "tool_use_start", id: "call_test", name: "get_weather" },
      { type: "tool_use_input_delta", id: "call_test", partialJson: '{"location":' },
      { type: "tool_use_input_delta", id: "call_test", partialJson: ' "SF"}' },
      { type: "tool_use_stop", id: "call_test" },
    ]);

    expect(result.value).toEqual({
      stopReason: "tool_use",
      content: [
        { type: "text", text: "Checking" },
        {
          type: "tool_use",
          id: "call_test",
          name: "get_weather",
          input: { location: "SF" },
        },
      ],
    });

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      },
    ]);
  });

  it("includes reasoning_content in assistant history for deepseek", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(streamFromString('data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n'), {
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

    const generator = provider.runWithTools!(
      {
        system: "sys",
        messages: [
          { role: "user", content: [{ type: "text", text: "Hi" }] },
          {
            role: "assistant",
            content: [
              { type: "thinking", text: "plan" },
              { type: "text", text: "Hello" },
              {
                type: "tool_use",
                id: "call_1",
                name: "get_weather",
                input: { location: "SF" },
              },
            ],
          },
          {
            role: "tool",
            content: [
              { type: "tool_result", toolUseId: "call_1", content: "24C" },
            ],
          },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
      { fetchFn },
    );

    while (!(await generator.next()).done) {
      // drain
    }

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<Record<string, unknown>>;
      thinking?: { type: string };
    };
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.messages[2]).toMatchObject({
      role: "assistant",
      content: "Hello",
      reasoning_content: "plan",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "get_weather",
            arguments: '{"location":"SF"}',
          },
        },
      ],
    });
    expect(body.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "24C",
    });
  });

  it("documents invalid interleaved tool/user order when messages are not batched", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(streamFromString('data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n'), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);
    const generator = provider.runWithTools!(
      {
        system: "sys",
        messages: [
          { role: "user", content: [{ type: "text", text: "search" }] },
          {
            role: "assistant",
            content: [
              { type: "text", text: "Searching" },
              { type: "tool_use", id: "call_1", name: "paperbox_list", input: {} },
              { type: "tool_use", id: "call_2", name: "academic_search", input: { query: "x" } },
            ],
          },
          { role: "tool", content: [{ type: "tool_result", toolUseId: "call_1", content: "{}" }] },
          { role: "user", uiHidden: true, content: [{ type: "text", text: "catalog 1" }] },
          { role: "tool", content: [{ type: "tool_result", toolUseId: "call_2", content: "[]" }] },
          { role: "user", uiHidden: true, content: [{ type: "text", text: "catalog 2" }] },
        ],
        tools: [
          { name: "paperbox_list", description: "list", inputSchema: { type: "object", properties: {} } },
          { name: "academic_search", description: "search", inputSchema: { type: "object", properties: {} } },
        ],
      },
      { fetchFn },
    );

    while (!(await generator.next()).done) {
      // drain
    }

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string }>;
    };
    expect(body.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "user",
      "tool",
      "user",
    ]);
  });

  it("serializes batched tool results before catalog user messages", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(streamFromString('data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n'), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new OpenAICompatibleProvider(CONFIG);
    const generator = provider.runWithTools!(
      {
        system: "sys",
        messages: [
          { role: "user", content: [{ type: "text", text: "search" }] },
          {
            role: "assistant",
            content: [
              { type: "text", text: "Searching" },
              { type: "tool_use", id: "call_1", name: "paperbox_list", input: {} },
              { type: "tool_use", id: "call_2", name: "academic_search", input: { query: "x" } },
            ],
          },
          { role: "tool", content: [{ type: "tool_result", toolUseId: "call_1", content: "{}" }] },
          { role: "tool", content: [{ type: "tool_result", toolUseId: "call_2", content: "[]" }] },
          { role: "user", uiHidden: true, content: [{ type: "text", text: "catalog 1" }] },
          { role: "user", uiHidden: true, content: [{ type: "text", text: "catalog 2" }] },
        ],
        tools: [
          { name: "paperbox_list", description: "list", inputSchema: { type: "object", properties: {} } },
          { name: "academic_search", description: "search", inputSchema: { type: "object", properties: {} } },
        ],
      },
      { fetchFn },
    );

    while (!(await generator.next()).done) {
      // drain
    }

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string }>;
    };
    expect(body.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "tool",
      "user",
      "user",
    ]);
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
