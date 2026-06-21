import { describe, it, expect, vi } from "vitest";
import { GeminiProvider, listGeminiModels } from "./gemini";

const CONFIG = {
  id: "gemini",
  apiKey: "test-key",
  baseURL: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-1.5-pro",
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

describe("GeminiProvider", () => {
  it("returns full string for non-streaming chat", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: "Hello world" }] } }],
      }),
    );

    const provider = new GeminiProvider(CONFIG);
    const result = await provider.chat(
      { system: "You are helpful.", messages: [{ role: "user", content: "Hi" }] },
      { fetchFn },
    );

    expect(result).toBe("Hello world");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
    );
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" });

    const body = JSON.parse(init.body as string) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    };
    expect(body.systemInstruction.parts[0]?.text).toBe("You are helpful.");
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "Hi" }] });
  });

  it("yields streamed token chunks via SSE", async () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n',
    ].join("");

    const fetchFn = vi.fn(async () =>
      new Response(streamFromString(sse), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new GeminiProvider(CONFIG);
    const iterable = provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }], stream: true },
      { fetchFn },
    );

    const chunks: string[] = [];
    for await (const chunk of iterable as AsyncIterable<string>) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hel", "lo"]);

    const [url] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:streamGenerateContent?alt=sse",
    );
  });

  it("sets responseMimeType when json is true", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
    );

    const provider = new GeminiProvider(CONFIG);
    await provider.chat(
      { system: "sys", messages: [{ role: "user", content: "Hi" }], json: true },
      { fetchFn },
    );

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig?: { responseMimeType: string };
    };
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json" });
  });
});

describe("listGeminiModels", () => {
  it("returns model ids that support generateContent", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        models: [
          {
            name: "models/gemini-1.5-pro",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/embedding-001",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    );

    const models = await listGeminiModels(CONFIG, { fetchFn });

    expect(models).toEqual(["gemini-1.5-pro"]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
    );
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" });
  });

  it("follows pagination when nextPageToken is present", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: "models/gemini-1.5-flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: "models/gemini-1.5-pro",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );

    const models = await listGeminiModels(CONFIG, { fetchFn });

    expect(models).toEqual(["gemini-1.5-flash", "gemini-1.5-pro"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&pageToken=page-2",
    );
  });
});
