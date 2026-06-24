import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { BOUNDARY_MARKER_PREFIX } from "@/core/agent/boundary";
import { extractStreamingPythonCode } from "@/core/agent/streamingToolInput";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { AssistantAvatar } from "./AssistantAvatar";
import { AssistantText } from "./AssistantText";
import { ArtifactCard } from "./ArtifactCard";
import { ArtifactDetailPanel } from "./ArtifactDetailPanel";
import { BoxRippleOverlay } from "./BoxRippleOverlay";
import { ChatComposer, type ChatSendPayload } from "./ChatComposer";
import { MessageBubble } from "./MessageBubble";
import { StreamingPythonToolCard } from "./StreamingPythonToolCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";

export interface AgentChatPanelProps {
  contextWindow: number;
  disabled: boolean;
  projectId: string;
  onSend: (payload: ChatSendPayload) => void | Promise<void>;
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
        return <AssistantText key={blockIndex} content={block.text} />;
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
  boundaryLabel: string,
) {
  if (!isUiVisibleMessage(message)) {
    return null;
  }

  if (message.role === "assistant" && message.llmHidden) {
    const card = message.content.find(
      (block): block is Extract<ContentBlock, { type: "artifact_card" }> =>
        block.type === "artifact_card",
    );
    if (card) {
      return (
        <div key={index}>
          <ArtifactCard
            artifactId={card.artifactId}
            title={card.title}
            kind={card.kind}
          />
        </div>
      );
    }
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
  const imageBlocks = message.content.filter(
    (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image",
  );
  const text = textBlocks.join("\n\n");
  const isBoundaryMarker = text.startsWith(BOUNDARY_MARKER_PREFIX);

  return (
    <div key={index}>
      {text ? (
        isBoundaryMarker ? (
          <div className="rounded-lg bg-[var(--rb-primary-hover)] px-4 py-2.5 text-sm text-white">
            {boundaryLabel}
          </div>
        ) : (
          <MessageBubble>{text}</MessageBubble>
        )
      ) : null}
      {imageBlocks.length > 0 ? (
        <div className={`flex flex-wrap gap-2 ${text ? "mt-2" : ""}`}>
          {imageBlocks.map((block, imageIndex) => (
            <img
              key={`${index}-image-${imageIndex}`}
              src={`data:${block.mediaType};base64,${block.data}`}
              alt=""
              className="max-h-48 max-w-full rounded-lg border border-[var(--rb-border)] object-contain"
            />
          ))}
        </div>
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
  const { t } = useTranslation();
  const messages = useAgentStore((state) => state.messages);
  const boxOpen = useAgentStore((state) => state.boxOpen);
  const boxRippleOrigin = useAgentStore((state) => state.boxRippleOrigin);
  const clearBoxRipple = useAgentStore((state) => state.clearBoxRipple);
  const streamingText = useAgentStore((state) => state.streamingText);
  const streamingThinking = useAgentStore((state) => state.streamingThinking);
  const streamingToolCalls = useAgentStore((state) => state.streamingToolCalls);
  const runningTools = useAgentStore((state) => state.runningTools);
  const contextBreakdown = useAgentStore((state) => state.contextBreakdown);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatSurfaceRef = useRef<HTMLDivElement>(null);

  const handleRippleComplete = useCallback(() => {
    clearBoxRipple();
  }, [clearBoxRipple]);

  const toolResults = useMemo(() => buildToolResultMap(messages), [messages]);
  const streamingPythonCalls = useMemo(
    () =>
      Object.entries(streamingToolCalls).filter(([, call]) => call.name === "python"),
    [streamingToolCalls],
  );
  const isStreaming = Boolean(
    streamingText || streamingThinking || streamingPythonCalls.length > 0,
  );
  const isEmptyChat = messages.length === 0 && !isStreaming;

  useEffect(() => {
    const scroll = () => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    if (!isStreaming) {
      scroll();
      return;
    }
    const timer = window.setTimeout(scroll, 120);
    return () => window.clearTimeout(timer);
  }, [messages, streamingText, streamingThinking, runningTools, streamingToolCalls, isStreaming]);

  return (
    <div
      className={[
        "flex h-full min-h-0 flex-col md:flex-row",
        isEmptyChat ? "rb-chat-panel-empty" : "bg-[var(--rb-page-bg)]",
      ].join(" ")}
    >
      <div
        ref={chatSurfaceRef}
        className={[
          "rb-chat-box-surface relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          boxOpen ? "rb-chat-box-open" : "rb-chat-box-closed",
          isEmptyChat ? "rb-chat-box-empty" : "",
          boxRippleOrigin ? "rb-chat-box-rippling" : "",
          boxRippleOrigin?.mode === "opening" ? "rb-box-ripple-opening" : "",
        ].join(" ")}
      >
        {boxRippleOrigin ? (
          <BoxRippleOverlay origin={boxRippleOrigin} onComplete={handleRippleComplete} />
        ) : null}

        <div className="relative z-1 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((message, index) =>
              renderMessage(
                message,
                index,
                toolResults,
                runningTools,
                projectId,
                t("agent.box.boundaryLabel"),
              ),
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
                    <AssistantText content={streamingText} />
                  ) : null}
                  {streamingPythonCalls.map(([id, call]) => (
                    <StreamingPythonToolCard
                      key={id}
                      code={extractStreamingPythonCode(call.partialJson)}
                      streaming
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        </div>

        <ChatComposer
          disabled={disabled}
          contextWindow={contextWindow}
          contextBreakdown={contextBreakdown}
          onSend={onSend}
          onStop={onStop}
          stopping={stopping}
          rippleContainerRef={chatSurfaceRef}
        />
        </div>
      </div>

      <ArtifactDetailPanel />
    </div>
  );
}
