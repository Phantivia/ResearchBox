import { describe, it, expect } from "vitest";
import { parseSSEStream } from "./sse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collectSSE(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const items: string[] = [];
  for await (const data of parseSSEStream(stream)) {
    items.push(data);
  }
  return items;
}

describe("parseSSEStream", () => {
  it("yields data payloads without the data: prefix", async () => {
    const stream = streamFromChunks([
      'data: {"token":"a"}\n\n',
      'data: {"token":"b"}\n\n',
    ]);

    await expect(collectSSE(stream)).resolves.toEqual([
      '{"token":"a"}',
      '{"token":"b"}',
    ]);
  });

  it("stops at [DONE]", async () => {
    const stream = streamFromChunks([
      'data: {"token":"a"}\n\n',
      "data: [DONE]\n\n",
      'data: {"token":"ignored"}\n\n',
    ]);

    await expect(collectSSE(stream)).resolves.toEqual(['{"token":"a"}']);
  });

  it("handles data lines split across chunks", async () => {
    const stream = streamFromChunks([
      "data: {\"tok",
      'en":"split"}\n\n',
      "data: [DONE]\n\n",
    ]);

    await expect(collectSSE(stream)).resolves.toEqual(['{"token":"split"}']);
  });

  it("handles CRLF line endings", async () => {
    const stream = streamFromChunks(['data: hello\r\n\r\ndata: [DONE]\r\n']);

    await expect(collectSSE(stream)).resolves.toEqual(["hello"]);
  });

  it("ignores non-data lines", async () => {
    const stream = streamFromChunks([
      "event: message\n",
      'data: payload\n',
      ": comment\n",
      "data: [DONE]\n",
    ]);

    await expect(collectSSE(stream)).resolves.toEqual(["payload"]);
  });
});
