export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }

        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return;
          }
          if (data.length > 0) {
            yield data;
          }
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }

    if (buffer.length > 0) {
      let line = buffer;
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          return;
        }
        if (data.length > 0) {
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
