import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { BOUNDARY_MARKER_PREFIX } from "@/core/agent/boundary";
import { extractCopyableText } from "@/core/agent/messageText";
import { extractStreamingPythonCode } from "@/core/agent/streamingToolInput";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { AssistantAvatar } from "./AssistantAvatar";
import { AssistantText } from "./AssistantText";
import { ArtifactCard } from "./ArtifactCard";
import { ArtifactDetailPanel } from "./ArtifactDetailPanel";
import { ChatComposer, type ChatSendPayload } from "./ChatComposer";
import type { PendingImageAttachment } from "./imageAttachments";
import { BoundaryNotice } from "./BoundaryNotice";
import { ChatMessageActions } from "./ChatMessageActions";
import { MessageBubble, UserMessageShell } from "./MessageBubble";
import { StreamingPythonToolCard } from "./StreamingPythonToolCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import { UserMessageInlineEditor } from "./UserMessageInlineEditor";
import { userMessageToSendPayload } from "./userMessagePayload";

export interface AgentChatPanelProps {
  contextWindow: number;
  disabled: boolean;
  projectId: string;
  onSend: (payload: ChatSendPayload) => void | Promise<void>;
  onStop?: () => void;
  stopping?: boolean;
  onResendUserMessage: (index: number, payload: ChatSendPayload) => void | Promise<void>;
  onRetryAssistantMessage: (index: number) => void;
}

type ToolResultEntry = {
  result: string;
  isError?: boolean;
};

type UserMessageEditSession = {
  index: number;
  draft: string;
  images: PendingImageAttachment[];
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

async function copyMessageText(message: AgentMessage): Promise<void> {
  const text = extractCopyableText(message);
  if (!text) {
    return;
  }
  await navigator.clipboard.writeText(text);
}

function renderMessage(
  message: AgentMessage,
  index: number,
  toolResults: Map<string, ToolResultEntry>,
  runningTools: Record<string, { name: string; stage: string }>,
  projectId: string,
  boundaryLabel: string,
  actionsDisabled: boolean,
  labels: {
    copy: string;
    retry: string;
    edit: string;
    cancel: string;
    submitResend: string;
  },
  editSession: UserMessageEditSession | null,
  interactionDisabled: boolean,
  onStartUserMessageEdit: (index: number, message: AgentMessage) => void,
  onEditDraftChange: (draft: string) => void,
  onCancelUserMessageEdit: () => void,
  onSubmitUserMessageEdit: () => void,
  onRetryAssistantMessage: (index: number) => void,
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
    const copyText = extractCopyableText(message);
    const showActions = !actionsDisabled;

    return (
      <div key={index} className="group relative flex gap-2">
        <AssistantAvatar />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-2">
            {renderAssistantContent(message.content, toolResults, runningTools, projectId)}
          </div>
          {showActions ? (
            <ChatMessageActions
              align="start"
              variant="assistant"
              copyLabel={labels.copy}
              retryLabel={labels.retry}
              onCopy={() => {
                if (copyText) {
                  void copyMessageText(message);
                }
              }}
              onRetry={() => onRetryAssistantMessage(index)}
            />
          ) : null}
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

  if (isBoundaryMarker) {
    return (
      <div key={index}>
        <BoundaryNotice label={boundaryLabel} />
      </div>
    );
  }

  const hasContent = text.length > 0 || imageBlocks.length > 0;
  if (!hasContent) {
    return null;
  }

  const isEditing = editSession?.index === index;

  if (isEditing && editSession) {
    return (
      <div key={index} className="flex w-full justify-end">
        <UserMessageInlineEditor
          text={editSession.draft}
          images={editSession.images}
          cancelLabel={labels.cancel}
          submitLabel={labels.submitResend}
          submitting={interactionDisabled}
          onTextChange={onEditDraftChange}
          onCancel={onCancelUserMessageEdit}
          onSubmit={onSubmitUserMessageEdit}
        />
      </div>
    );
  }

  return (
    <div key={index}>
      <UserMessageShell
        showActions={!actionsDisabled}
        copyLabel={labels.copy}
        retryLabel={labels.retry}
        editLabel={labels.edit}
        onCopy={() => {
          void copyMessageText(message);
        }}
        onRetry={() => onStartUserMessageEdit(index, message)}
        onEdit={() => onStartUserMessageEdit(index, message)}
      >
        {text ? <MessageBubble>{text}</MessageBubble> : null}
        {imageBlocks.length > 0 ? (
          <div className="mt-2 flex flex-wrap justify-end gap-2">
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
      </UserMessageShell>
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
  onResendUserMessage,
  onRetryAssistantMessage,
}: AgentChatPanelProps) {
  const { t } = useTranslation();
  const messages = useAgentStore((state) => state.messages);
  const streamingText = useAgentStore((state) => state.streamingText);
  const streamingThinking = useAgentStore((state) => state.streamingThinking);
  const streamingToolCalls = useAgentStore((state) => state.streamingToolCalls);
  const runningTools = useAgentStore((state) => state.runningTools);
  const contextBreakdown = useAgentStore((state) => state.contextBreakdown);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editSession, setEditSession] = useState<UserMessageEditSession | null>(null);

  const toolResults = useMemo(() => buildToolResultMap(messages), [messages]);
  const streamingPythonCalls = useMemo(
    () =>
      Object.entries(streamingToolCalls).filter(([, call]) => call.name === "python"),
    [streamingToolCalls],
  );
  const isStreaming = Boolean(
    streamingText || streamingThinking || streamingPythonCalls.length > 0,
  );
  const isEditingUserMessage = editSession !== null;
  const interactionDisabled = disabled || isStreaming;
  const actionsDisabled = interactionDisabled || isEditingUserMessage;

  const actionLabels = useMemo(
    () => ({
      copy: t("agent.message.copy"),
      retry: t("agent.message.retry"),
      edit: t("agent.message.edit"),
      cancel: t("agent.message.cancel"),
      submitResend: t("agent.message.submitResend"),
    }),
    [t],
  );

  useEffect(() => {
    if (editSession == null) {
      return;
    }
    const message = messages[editSession.index];
    if (!message || message.role !== "user") {
      setEditSession(null);
    }
  }, [editSession, messages]);

  const startUserMessageEdit = (index: number, message: AgentMessage) => {
    const payload = userMessageToSendPayload(message);
    setEditSession({
      index,
      draft: payload.text,
      images: payload.images,
    });
  };

  const handleSubmitUserMessageEdit = () => {
    if (!editSession) {
      return;
    }
    const trimmed = editSession.draft.trim();
    if (trimmed.length === 0 && editSession.images.length === 0) {
      return;
    }
    const { index, draft, images } = editSession;
    setEditSession(null);
    void onResendUserMessage(index, { text: draft, images });
  };

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
    <div className="flex h-full min-h-0 flex-col md:flex-row bg-[var(--rb-page-bg)]">
      <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative z-1 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((message, index) =>
              renderMessage(
                message,
                index,
                toolResults,
                runningTools,
                projectId,
                t("agent.box.boundaryLabel"),
                actionsDisabled,
                actionLabels,
                editSession,
                interactionDisabled,
                startUserMessageEdit,
                (draft) => {
                  setEditSession((current) => (current ? { ...current, draft } : current));
                },
                () => setEditSession(null),
                handleSubmitUserMessageEdit,
                onRetryAssistantMessage,
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
          disabled={disabled || isEditingUserMessage}
          contextWindow={contextWindow}
          contextBreakdown={contextBreakdown}
          onSend={onSend}
          onStop={onStop}
          stopping={stopping}
        />
        </div>
      </div>

      <ArtifactDetailPanel />
    </div>
  );
}
