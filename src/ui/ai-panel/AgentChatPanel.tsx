import { useEffect, useMemo, useRef } from "react";
import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { useAgentStore } from "@/store";
import { ApprovalDialog } from "./ApprovalDialog";
import { AssistantAvatar } from "./AssistantAvatar";
import { ChatComposer } from "./ChatComposer";
import { ContextMeter } from "./ContextMeter";
import { MessageBubble } from "./MessageBubble";
import { BoxSwitch } from "./BoxSwitch";
import { PermissionModeSwitch } from "./PermissionModeSwitch";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";

export interface AgentChatPanelProps {
  contextWindow: number;
  disabled: boolean;
  projectId: string;
  onSend: (text: string) => void;
  onStop?: () => void;
  stopping?: boolean;
}

type ToolResultEntry = {
  result: string;
  isError?: boolean;
};

function buildToolResultMap(messages: AgentMessage[]): Map<string, ToolResultEntry> {
  const map = new Map<string, ToolResultEntry>();
  for (const message of messages) {
    if (message.role !== "tool") {
      continue;
    }
    for (const block of message.content) {
      if (block.type === "tool_result") {
        map.set(block.toolUseId, {
          result: block.content,
          isError: block.isError,
        });
      }
    }
  }
  return map;
}

function renderAssistantContent(
  content: ContentBlock[],
  toolResults: Map<string, ToolResultEntry>,
  runningTools: Record<string, { name: string; stage: string }>,
  projectId: string,
) {
  const hasText = content.some((block) => block.type === "text");

  return content.map((block, blockIndex) => {
    switch (block.type) {
      case "thinking":
        return (
          <ThinkingBlock
            key={blockIndex}
            text={block.text}
            responseStarted={hasText}
          />
        );
      case "text":
        return (
          <MessageBubble key={blockIndex} role="assistant">
            {block.text}
          </MessageBubble>
        );
      case "tool_use": {
        const resultEntry = toolResults.get(block.id);
        const running = runningTools[block.id];
        return (
          <ToolCallCard
            key={block.id}
            name={block.name}
            input={block.input}
            stage={running?.stage}
            result={resultEntry?.result}
            isError={resultEntry?.isError}
            projectId={projectId}
          />
        );
      }
      default:
        return null;
    }
  });
}

function isUiVisibleMessage(message: AgentMessage): boolean {
  if (message.uiHidden) {
    return false;
  }
  if (message.role === "tool") {
    return false;
  }
  return true;
}

function renderMessage(
  message: AgentMessage,
  index: number,
  toolResults: Map<string, ToolResultEntry>,
  runningTools: Record<string, { name: string; stage: string }>,
  projectId: string,
) {
  if (!isUiVisibleMessage(message)) {
    return null;
  }

  if (message.role === "assistant") {
    return (
      <div key={index} className="flex gap-2">
        <AssistantAvatar />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {renderAssistantContent(message.content, toolResults, runningTools, projectId)}
        </div>
      </div>
    );
  }

  const textBlocks = message.content
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text);
  const text = textBlocks.join("\n\n");
  const isBoundaryMarker = text.startsWith("【盒子已关闭】");

  return (
    <div key={index}>
      {text ? (
        isBoundaryMarker ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
            {text}
          </div>
        ) : (
          <MessageBubble role="user">{text}</MessageBubble>
        )
      ) : null}
    </div>
  );
}

export function AgentChatPanel({
  contextWindow,
  disabled,
  projectId,
  onSend,
  onStop,
  stopping = false,
}: AgentChatPanelProps) {
  const messages = useAgentStore((state) => state.messages);
  const streamingText = useAgentStore((state) => state.streamingText);
  const streamingThinking = useAgentStore((state) => state.streamingThinking);
  const runningTools = useAgentStore((state) => state.runningTools);
  const contextChars = useAgentStore((state) => state.contextChars);
  const bottomRef = useRef<HTMLDivElement>(null);

  const toolResults = useMemo(() => buildToolResultMap(messages), [messages]);
  const isStreaming = Boolean(streamingText || streamingThinking);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, streamingThinking, runningTools]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--rb-page-bg)]">
      <div className="border-b border-[var(--rb-border)] bg-[var(--rb-card-bg)]">
        <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-[var(--rb-border)]">
          <BoxSwitch className="min-w-0 flex-1" />
          <PermissionModeSwitch className="min-w-0 flex-1" />
        </div>
      </div>
      <ContextMeter tokens={contextChars} contextWindow={contextWindow} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <ApprovalDialog />

          {messages.map((message, index) =>
            renderMessage(message, index, toolResults, runningTools, projectId),
          )}

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

      <ChatComposer
        disabled={disabled}
        onSend={onSend}
        onStop={onStop}
        stopping={stopping}
      />
    </div>
  );
}
