import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider, listAnthropicModels } from "./anthropic";
import type { StreamEvent } from "../types";

const CONFIG = {
  id: "anthropic",
  apiKey: "test-key",
  baseURL: "https://api.anthropic.com",
  model: "claude-3-5-sonnet-20241022",
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

describe("AnthropicProvider", () => {
  it("parses content_block_delta events from SSE stream", async () => {
    const sse = [
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
      "event: message_stop\n",
      "data: {\"type\":\"message_stop\"}\n\n",
    ].join("");

    const fetchFn = vi.fn(async () =>
      new Response(streamFromString(sse), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new AnthropicProvider(CONFIG);
    const iterable = provider.chat(
      {
        system: "You are helpful.",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
      { fetchFn },
    );

    const chunks: string[] = [];
    for await (const chunk of iterable as AsyncIterable<string>) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " world"]);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
  });
});

describe("AnthropicProvider.runWithTools", () => {
  it("streams text and tool_use deltas and returns AssistantMessage", async () => {
    const sse = [
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_test","name":"get_weather","input":{}}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"location\\":"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" \\"SF\\"}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":1}\n\n',
      'event: message_delta\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":89}}\n\n',
      "event: message_stop\n",
      'data: {"type":"message_stop"}\n\n',
    ].join("");

    const fetchFn = vi.fn(async () =>
      new Response(streamFromString(sse), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new AnthropicProvider(CONFIG);
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

    const events: StreamEvent[] = [];
    let result = await generator.next();
    while (!result.done) {
      events.push(result.value);
      result = await generator.next();
    }

    expect(events).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "tool_use_start", id: "toolu_test", name: "get_weather" },
      { type: "tool_use_input_delta", id: "toolu_test", partialJson: "" },
      { type: "tool_use_input_delta", id: "toolu_test", partialJson: '{"location":' },
      { type: "tool_use_input_delta", id: "toolu_test", partialJson: ' "SF"}' },
      { type: "tool_use_stop", id: "toolu_test" },
    ]);

    expect(result.value).toEqual({
      stopReason: "tool_use",
      content: [
        { type: "text", text: "Hello" },
        {
          type: "tool_use",
          id: "toolu_test",
          name: "get_weather",
          input: { location: "SF" },
        },
      ],
    });

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(8192);
    expect(body.tools).toEqual([
      {
        name: "get_weather",
        description: "Get weather",
        input_schema: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
      },
    ]);
  });
});

describe("listAnthropicModels", () => {
  it("returns model ids from the models endpoint", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ data: [{ id: "claude-3-5-sonnet-20241022" }] }),
    );

    const models = await listAnthropicModels(CONFIG, { fetchFn });

    expect(models).toEqual(["claude-3-5-sonnet-20241022"]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    expect(init.headers).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
    });
  });

  it("follows pagination when has_more is true", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "claude-a" }],
          has_more: true,
          last_id: "claude-a",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "claude-b" }],
          has_more: false,
          last_id: "claude-b",
        }),
      );

    const models = await listAnthropicModels(CONFIG, { fetchFn });

    expect(models).toEqual(["claude-a", "claude-b"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      "https://api.anthropic.com/v1/models?limit=1000&after_id=claude-a",
    );
  });
});
