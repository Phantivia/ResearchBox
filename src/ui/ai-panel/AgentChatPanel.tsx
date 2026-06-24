import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { BOUNDARY_MARKER_PREFIX } from "@/core/agent/boundary";
import { parseRecommendationMarker, isRecommendationMarker } from "@/core/agent/recommendation/markers";
import { recommendationNoticeLabel } from "@/core/agent/recommendation/display";
import { parsePaperRecommendations } from "@/core/agent/recommendation/types";
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
import { RecommendationNotice } from "./RecommendationNotice";
import { RecommendationPanel } from "./RecommendationPanel";
import { ChatMessageActions } from "./ChatMessageActions";
import { MessageBubble, UserMessageShell } from "./MessageBubble";
import { StreamingPythonToolCard } from "./StreamingPythonToolCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import { UserMessageInlineEditor } from "./UserMessageInlineEditor";
import { UserOcrImagePreview, UserOcrResultPanel } from "./UserOcrSections";
import {
  parseUserMessageDisplay,
  userMessageToSendPayload,
  type UserMessageSendPayload,
} from "./userMessagePayload";

export interface AgentChatPanelProps {
  contextWindow: number;
  disabled: boolean;
  projectId: string;
  onSend: (payload: ChatSendPayload) => void | Promise<void>;
  onStop?: () => void;
  stopping?: boolean;
  onResendUserMessage: (index: number, payload: UserMessageSendPayload) => void | Promise<void>;
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
  ocrTexts: string[];
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
            toolUseId={block.id}
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

async function copyMessageText(message: AgentMessage): Promise<boolean> {
  const text = extractCopyableText(message);
  if (!text) {
    return false;
  }
  await navigator.clipboard.writeText(text);
  return true;
}

function renderMessage(
  message: AgentMessage,
  index: number,
  toolResults: Map<string, ToolResultEntry>,
  runningTools: Record<string, { name: string; stage: string }>,
  projectId: string,
  boundaryLabel: string,
  recommendationLabels: {
    included: (label: string) => string;
    ignored: (label: string) => string;
  },
  actionsDisabled: boolean,
  labels: {
    copy: string;
    copied: string;
    retry: string;
    edit: string;
    cancel: string;
    submitResend: string;
    ocrResultLabel: string;
    ocrEmpty: string;
    ocrRunning: string;
    removeImage: string;
  },
  editSession: UserMessageEditSession | null,
  interactionDisabled: boolean,
  onStartUserMessageEdit: (index: number, message: AgentMessage) => void,
  onEditDraftChange: (draft: string) => void,
  onEditOcrTextChange: (index: number, text: string) => void,
  onEditRemoveImage: (id: string) => void,
  onCancelUserMessageEdit: () => void,
  onSubmitUserMessageEdit: () => void,
  onResendUserMessage: (index: number, payload: UserMessageSendPayload) => void | Promise<void>,
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
              copySuccessLabel={labels.copied}
              retryLabel={labels.retry}
              onCopy={() => (copyText ? copyMessageText(message) : Promise.resolve(false))}
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
  const rawText = textBlocks.join("\n\n");
  const display = parseUserMessageDisplay(message);
  const text = display.legacyOcrSections.length > 0 || display.ocrItems.length > 0 ? display.text : rawText;
  const isBoundaryMarker = rawText.startsWith(BOUNDARY_MARKER_PREFIX);
  const recommendationMarker = isRecommendationMarker(message)
    ? parseRecommendationMarker(rawText)
    : null;

  if (recommendationMarker) {
    const label = recommendationNoticeLabel(
      recommendationMarker.title,
      recommendationMarker.arxivId,
    );
    const notice =
      recommendationMarker.decision === "included"
        ? recommendationLabels.included(label)
        : recommendationLabels.ignored(label);
    return (
      <div key={index}>
        <RecommendationNotice label={notice} />
      </div>
    );
  }

  if (isBoundaryMarker) {
    return (
      <div key={index}>
        <BoundaryNotice label={boundaryLabel} />
      </div>
    );
  }

  const hasContent =
    text.length > 0 ||
    display.directImages.length > 0 ||
    display.ocrItems.length > 0 ||
    display.legacyOcrSections.length > 0;
  if (!hasContent) {
    return null;
  }

  const isEditing = editSession?.index === index;
  const hasPendingOcr = display.ocrItems.some((item) => item.ocrPending);

  if (isEditing && editSession) {
    return (
      <div key={index} className="flex w-full justify-end">
        <UserMessageInlineEditor
          text={editSession.draft}
          images={editSession.images}
          ocrTexts={editSession.ocrTexts}
          ocrResultLabel={labels.ocrResultLabel}
          ocrEmptyLabel={labels.ocrEmpty}
          removeImageLabel={labels.removeImage}
          cancelLabel={labels.cancel}
          submitLabel={labels.submitResend}
          submitting={interactionDisabled}
          onTextChange={onEditDraftChange}
          onOcrTextChange={onEditOcrTextChange}
          onRemoveImage={onEditRemoveImage}
          onCancel={onCancelUserMessageEdit}
          onSubmit={onSubmitUserMessageEdit}
        />
      </div>
    );
  }

  return (
    <div key={index}>
      <UserMessageShell
        showActions={!actionsDisabled && !hasPendingOcr}
        copyLabel={labels.copy}
        copySuccessLabel={labels.copied}
        retryLabel={labels.retry}
        editLabel={labels.edit}
        onCopy={() => copyMessageText(message)}
        onRetry={() => {
          void onResendUserMessage(index, userMessageToSendPayload(message));
        }}
        onEdit={() => onStartUserMessageEdit(index, message)}
      >
        {text ? <MessageBubble>{text}</MessageBubble> : null}
        {display.ocrItems.map((item, itemIndex) => (
          <div key={`${index}-ocr-${itemIndex}`} className="mt-2 flex w-full flex-col items-end">
            <UserOcrImagePreview
              src={`data:${item.image.mediaType};base64,${item.image.data}`}
              alt={item.imageName}
            />
            <UserOcrResultPanel
              label={labels.ocrResultLabel}
              emptyLabel={labels.ocrEmpty}
              text={item.ocrText}
              pending={item.ocrPending}
              runningLabel={labels.ocrRunning}
              collapsible={!item.ocrPending}
            />
          </div>
        ))}
        {display.legacyOcrSections.map((section, sectionIndex) => (
          <div key={`${index}-legacy-ocr-${sectionIndex}`} className="mt-2 flex w-full flex-col items-end">
            <UserOcrResultPanel
              label={`${labels.ocrResultLabel} · ${section.imageName}`}
              emptyLabel={labels.ocrEmpty}
              text={section.ocrText}
              collapsible
            />
          </div>
        ))}
        {display.directImages.length > 0 ? (
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {display.directImages.map((block, imageIndex) => (
              <UserOcrImagePreview
                key={`${index}-image-${imageIndex}`}
                src={`data:${block.mediaType};base64,${block.data}`}
                alt=""
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
  const openRecommendationSession = useAgentStore((state) => state.openRecommendationSession);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openedRecommendationToolsRef = useRef(new Set<string>());
  const [editSession, setEditSession] = useState<UserMessageEditSession | null>(null);

  const toolResults = useMemo(() => buildToolResultMap(messages), [messages]);

  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") {
        continue;
      }
      for (const block of message.content) {
        if (block.type !== "tool_use" || block.name !== "recommend_papers") {
          continue;
        }
        if (openedRecommendationToolsRef.current.has(block.id)) {
          continue;
        }
        const resultEntry = toolResults.get(block.id);
        if (!resultEntry || resultEntry.isError) {
          continue;
        }
        const papers = parsePaperRecommendations(resultEntry.result);
        if (!papers || papers.length === 0) {
          continue;
        }
        openedRecommendationToolsRef.current.add(block.id);
        openRecommendationSession(block.id, papers);
      }
    }
  }, [messages, openRecommendationSession, toolResults]);
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
      copied: t("agent.message.copied"),
      retry: t("agent.message.retry"),
      edit: t("agent.message.edit"),
      cancel: t("agent.message.cancel"),
      submitResend: t("agent.message.submitResend"),
      ocrResultLabel: t("agent.ocrResultLabel"),
      ocrEmpty: t("agent.ocrEmpty"),
      ocrRunning: t("agent.ocrRunning"),
      removeImage: t("agent.attachRemove"),
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
      ocrTexts: payload.ocrTexts ?? [],
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
    const { index, draft, images, ocrTexts } = editSession;
    setEditSession(null);
    void onResendUserMessage(index, {
      text: draft,
      images,
      ocrTexts: ocrTexts.length > 0 ? ocrTexts : undefined,
    });
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
                {
                  included: (label) => t("agent.recommend.noticeIncluded", { label }),
                  ignored: (label) => t("agent.recommend.noticeIgnored", { label }),
                },
                actionsDisabled,
                actionLabels,
                editSession,
                interactionDisabled,
                startUserMessageEdit,
                (draft) => {
                  setEditSession((current) => (current ? { ...current, draft } : current));
                },
                (ocrIndex, ocrText) => {
                  setEditSession((current) => {
                    if (!current) {
                      return current;
                    }
                    const nextOcrTexts = [...current.ocrTexts];
                    nextOcrTexts[ocrIndex] = ocrText;
                    return { ...current, ocrTexts: nextOcrTexts };
                  });
                },
                (imageId) => {
                  setEditSession((current) => {
                    if (!current) {
                      return current;
                    }
                    const removeIndex = current.images.findIndex((image) => image.id === imageId);
                    if (removeIndex < 0) {
                      return current;
                    }
                    return {
                      ...current,
                      images: current.images.filter((image) => image.id !== imageId),
                      ocrTexts: current.ocrTexts.filter((_, index) => index !== removeIndex),
                    };
                  });
                },
                () => setEditSession(null),
                handleSubmitUserMessageEdit,
                onResendUserMessage,
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
          projectId={projectId}
          onSend={onSend}
          onStop={onStop}
          stopping={stopping}
        />
        </div>
      </div>

      <RecommendationPanel projectId={projectId} />
      <ArtifactDetailPanel />
    </div>
  );
}
