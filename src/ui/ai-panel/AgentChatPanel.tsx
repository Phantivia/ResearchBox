import { useEffect, useRef } from "react";
import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { useAgentStore } from "@/store";
import { AssistantAvatar } from "./AssistantAvatar";
import { ChatComposer } from "./ChatComposer";
import { ContextMeter } from "./ContextMeter";
import { MessageBubble } from "./MessageBubble";
import { ThinkingBlock } from "./ThinkingBlock";

export interface AgentChatPanelProps {
  contextWindow: number;
  disabled: boolean;
  onSend: (text: string) => void;
}

function blockText(block: ContentBlock): string | null {
  switch (block.type) {
    case "text":
      return block.text;
    case "thinking":
      return null;
    default:
      return null;
  }
}

function renderMessage(message: AgentMessage, index: number) {
  if (message.role === "tool") {
    return null;
  }

  const bubbleRole: "user" | "assistant" =
    message.role === "user" ? "user" : "assistant";
  const thinkingBlocks = message.content.filter(
    (block): block is Extract<ContentBlock, { type: "thinking" }> =>
      block.type === "thinking",
  );
  const textBlocks = message.content
    .map(blockText)
    .filter((text): text is string => text != null);
  const text = textBlocks.join("\n\n");

  if (message.role === "assistant") {
    const hasText = Boolean(text);

    return (
      <div key={index} className="flex gap-2">
        <AssistantAvatar />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {thinkingBlocks.map((block, blockIndex) => (
            <ThinkingBlock
              key={blockIndex}
              text={block.text}
              responseStarted={hasText}
            />
          ))}
          {text ? <MessageBubble role="assistant">{text}</MessageBubble> : null}
        </div>
      </div>
    );
  }

  return (
    <div key={index}>
      {text ? <MessageBubble role={bubbleRole}>{text}</MessageBubble> : null}
    </div>
  );
}

export function AgentChatPanel({
  contextWindow,
  disabled,
  onSend,
}: AgentChatPanelProps) {
  const messages = useAgentStore((state) => state.messages);
  const streamingText = useAgentStore((state) => state.streamingText);
  const streamingThinking = useAgentStore((state) => state.streamingThinking);
  const contextChars = useAgentStore((state) => state.contextChars);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isStreaming = Boolean(streamingText || streamingThinking);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, streamingThinking]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--rb-page-bg)]">
      <ContextMeter tokens={contextChars} contextWindow={contextWindow} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((message, index) => renderMessage(message, index))}

          {isStreaming ? (
            <div className="flex gap-2">
              <AssistantAvatar />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {streamingThinking ? (
                  <ThinkingBlock
                    text={streamingThinking}
                    streaming
                    responseStarted={Boolean(streamingText)}
                  />
                ) : null}
                {streamingText ? (
                  <MessageBubble role="assistant">{streamingText}</MessageBubble>
                ) : null}
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <ChatComposer disabled={disabled} onSend={onSend} />
    </div>
  );
}
