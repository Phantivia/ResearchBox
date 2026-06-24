import type { LLMProvider, Message } from "@/core/llm/types";
import { isChatThinkingChunk, type ChatStreamChunk } from "@/core/llm/types";
import type { AgentMessage } from "./types";

function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<ChatStreamChunk> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  );
}

function projectAgentMessages(messages: AgentMessage[]): Message[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content
      .filter(
        (block): block is { type: "text"; text: string } =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join(""),
  }));
}

export type RunChatResult = {
  text: string;
  thinking: string;
};

export type RunChatParams = {
  provider: LLMProvider;
  system: string;
  messages: AgentMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onThinkingDelta?: (text: string) => void;
  onDone: (result: RunChatResult) => void;
  onError: (e: unknown) => void;
};

export async function runChat(params: RunChatParams): Promise<void> {
  const {
    provider,
    system,
    messages,
    signal,
    onDelta,
    onThinkingDelta,
    onDone,
    onError,
  } = params;

  if (signal.aborted) {
    return;
  }

  try {
    const chatResult = provider.chat({
      system,
      messages: projectAgentMessages(messages),
      stream: true,
      signal,
    });

    if (isAsyncIterable(chatResult)) {
      let accumulatedText = "";
      let accumulatedThinking = "";
      for await (const chunk of chatResult) {
        if (signal.aborted) {
          return;
        }
        if (isChatThinkingChunk(chunk)) {
          accumulatedThinking += chunk.text;
          onThinkingDelta?.(chunk.text);
          continue;
        }
        accumulatedText += chunk;
        onDelta(chunk);
      }
      if (signal.aborted) {
        return;
      }
      onDone({ text: accumulatedText, thinking: accumulatedThinking });
      return;
    }

    const full = await chatResult;
    if (signal.aborted) {
      return;
    }
    onDone({ text: full, thinking: "" });
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    onError(error);
  }
}
