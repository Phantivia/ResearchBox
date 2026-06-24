import { useCallback, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { runAgent, type BatchExecutor } from "@/core/agent/loop";
import { makeApprovalFn } from "@/core/agent/approval";
import { executeBatched } from "@/core/agent/orchestrate";
import { deriveSessionTitle } from "@/core/agent/session";
import { abortActiveAgentRun, setActiveAgentAbort } from "@/core/agent/runController";
import { buildAgentSystemPrompt } from "@/core/agent/systemPrompt";
import { buildResearchTools } from "@/core/agent/tools";
import { buildUserMessageBlocks, modelSupportsImageInput, applyOcrTextsToContent } from "@/core/agent/multimodal";
import { ocrImages } from "@/ui/ai-panel/tesseractOcr";
import type { AgentDeps, AgentMessage, AgentStore, ContentBlock, Terminal } from "@/core/agent/types";
import { estimateContextBreakdown } from "@/core/agent/contextSize";
import { toToolSchema } from "@/core/agent/schema";
import { createProvider } from "@/core/llm";
import { db, listAgentSessions, saveAgentSession } from "@/db";
import { useTranslation } from "@/i18n";
import { useAgentStore, usePaperStore, useProjectStore, useSettingsStore } from "@/store";
import { AgentChatPanel } from "@/ui/ai-panel";
import type { ChatSendPayload } from "@/ui/ai-panel/ChatComposer";
import { CurrentProjectLabel } from "@/ui/shell/CurrentProjectLabel";
import { FeatureIcon } from "@/ui/shell/featureIcons";

const DEFAULT_CONTEXT_WINDOW = 200_000;
const SESSION_SAVE_DEBOUNCE_MS = 800;

let chatMountedProjectId: string | null = null;
let sessionRestoreGeneration = 0;

function resolveContextWindow(
  openRouterContextLength: number | null | undefined,
): number {
  if (openRouterContextLength != null && openRouterContextLength > 0) {
    return openRouterContextLength;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function messagesWithStreaming(
  messages: AgentMessage[],
  streamingText: string,
  streamingThinking: string,
): AgentMessage[] {
  if (!streamingText && !streamingThinking) {
    return messages;
  }

  const content: ContentBlock[] = [];
  if (streamingThinking) {
    content.push({ type: "thinking", text: streamingThinking });
  }
  if (streamingText) {
    content.push({ type: "text", text: streamingText });
  }

  if (content.length === 0) {
    return messages;
  }

  return [...messages, { role: "assistant", content }];
}

function buildAgentStoreAdapter(): AgentStore {
  return {
    get messages() {
      return useAgentStore.getState().messages;
    },
    get pendingApprovals() {
      return useAgentStore.getState().pendingApprovals.map(({ tool, input, reason, risk }) => ({
        tool,
        input,
        reason,
        risk,
      }));
    },
    get runningTools() {
      return useAgentStore.getState().runningTools;
    },
    get permissionMode() {
      return useSettingsStore.getState().permissionMode;
    },
    append: (message) => useAgentStore.getState().append(message),
    enqueueApproval: (request) => useAgentStore.getState().enqueueApproval(request),
    setRunningTool: (id, info) => useAgentStore.getState().setRunningTool(id, info),
    clearRunningTool: (id) => useAgentStore.getState().clearRunningTool(id),
  };
}

function processToolBlocks(
  message: AgentMessage,
  runningLabel: string,
  toolNameByUseId: Map<string, string>,
): void {
  const { append, setRunningTool, clearRunningTool, bumpArtifactsVersion } =
    useAgentStore.getState();
  for (const block of message.content) {
    if (block.type === "tool_use") {
      toolNameByUseId.set(block.id, block.name);
      setRunningTool(block.id, { name: block.name, stage: runningLabel });
    }
    if (block.type === "tool_result") {
      clearRunningTool(block.toolUseId);
      const toolName = toolNameByUseId.get(block.toolUseId);
      if (toolName === "artifacts" && !block.isError) {
        bumpArtifactsVersion();
        try {
          const parsed = JSON.parse(block.content) as {
            artifactId?: string;
            title?: string;
            kind?: string;
          };
          if (parsed.artifactId && parsed.title && parsed.kind) {
            append({
              role: "assistant",
              llmHidden: true,
              content: [
                {
                  type: "artifact_card",
                  artifactId: parsed.artifactId,
                  title: parsed.title,
                  kind: parsed.kind as "summary" | "compare-table" | "outline" | "note",
                },
              ],
            });
          }
        } catch {
          // Ignore malformed tool output in UI card insertion.
        }
      }
    }
  }
}

const runTools: BatchExecutor = async function* (toolUses, tools, deps) {
  const calls = toolUses.map(({ id, name, input }) => ({ id, name, input }));
  const batch = executeBatched(calls, tools, deps);
  let step = await batch.next();
  while (!step.done) {
    step = await batch.next();
  }
  return step.value;
};

export default function AgentChat() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { projects } = useProjectStore();
  const projectName = projects.find((project) => project.id === projectId)?.name;

  const {
    loaded: settingsLoaded,
    load: loadSettings,
    getActiveProvider,
    hasActiveProvider,
    allowWeb,
    allowCode,
  } = useSettingsStore();
  const messages = useAgentStore((state) => state.messages);
  const streamingText = useAgentStore((state) => state.streamingText);
  const streamingThinking = useAgentStore((state) => state.streamingThinking);
  const append = useAgentStore((state) => state.append);
  const updateMessageAtIndex = useAgentStore((state) => state.updateMessageAtIndex);
  const truncateMessages = useAgentStore((state) => state.truncateMessages);
  const setStreaming = useAgentStore((state) => state.setStreaming);
  const setContextBreakdown = useAgentStore((state) => state.setContextBreakdown);
  const setCurrentSessionId = useAgentStore((state) => state.setCurrentSessionId);
  const bumpSessionsVersion = useAgentStore((state) => state.bumpSessionsVersion);
  const boxOpen = useAgentStore((state) => state.boxOpen);
  const agentRunning = useAgentStore((state) => state.agentRunning);
  const agentStopping = useAgentStore((state) => state.agentStopping);
  const setAgentRunning = useAgentStore((state) => state.setAgentRunning);
  const setAgentStopping = useAgentStore((state) => state.setAgentStopping);
  const loadForProject = usePaperStore((state) => state.loadForProject);

  const toolNameByUseIdRef = useRef(new Map<string, string>());
  const persistSession = useCallback(async () => {
    if (!projectId) {
      return;
    }

    const { messages: currentMessages, currentSessionId } = useAgentStore.getState();
    if (currentMessages.length === 0) {
      return;
    }

    const id = await saveAgentSession({
      id: currentSessionId ?? undefined,
      projectId,
      title: deriveSessionTitle(currentMessages),
      messages: currentMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (currentSessionId !== id) {
      setCurrentSessionId(id);
    }
    bumpSessionsVersion();
  }, [projectId, setCurrentSessionId, bumpSessionsVersion]);

  useEffect(() => {
    if (!settingsLoaded) {
      void loadSettings();
    }
  }, [settingsLoaded, loadSettings]);

  useEffect(() => {
    if (projectId) {
      void loadForProject(projectId);
    }
  }, [projectId, loadForProject]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const projectChanged = chatMountedProjectId !== projectId;

    if (projectChanged) {
      chatMountedProjectId = projectId;
      useAgentStore.getState().startNewSession({ skipAutoRestore: false });
    }

    const restoreGeneration = ++sessionRestoreGeneration;
    let cancelled = false;
    void listAgentSessions(projectId).then((sessions) => {
      const stale = cancelled || restoreGeneration !== sessionRestoreGeneration;
      const state = useAgentStore.getState();
      const skipAutoRestore = state.skipSessionAutoRestore;
      if (!stale && skipAutoRestore) {
        useAgentStore.setState({ skipSessionAutoRestore: false });
      }
      if (
        !stale &&
        !skipAutoRestore &&
        sessions.length > 0 &&
        state.currentSessionId === null &&
        state.messages.length === 0
      ) {
        useAgentStore.getState().loadSession(sessions[0]!);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || messages.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistSession();
    }, SESSION_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [messages, projectId, persistSession]);

  useEffect(() => {
    return () => {
      void persistSession();
    };
  }, [persistSession]);

  const providerConfig = getActiveProvider();
  const contextWindow = resolveContextWindow(
    providerConfig?.openRouterMeta?.contextLength,
  );

  useEffect(() => {
    const system = buildAgentSystemPrompt({
      projectName,
      date: new Date().toISOString().slice(0, 10),
      boxOpen,
    });
    const toolDefinitions = buildResearchTools({ allowWeb, allowCode }).map(toToolSchema);
    const breakdown = estimateContextBreakdown(
      messagesWithStreaming(messages, streamingText, streamingThinking),
      { systemPrompt: system, toolDefinitions },
    );
    setContextBreakdown(breakdown);
  }, [
    messages,
    streamingText,
    streamingThinking,
    projectName,
    boxOpen,
    allowWeb,
    allowCode,
    setContextBreakdown,
  ]);

  const appendTerminalNotice = useCallback(
    (terminal: Terminal) => {
      switch (terminal.reason) {
        case "completed":
          return;
        case "aborted":
          append({
            role: "assistant",
            content: [{ type: "text", text: t("agent.terminal.aborted") }],
          });
          return;
        case "max_turns":
          append({
            role: "assistant",
            content: [{ type: "text", text: t("agent.terminal.maxTurns") }],
          });
          return;
        case "approval_denied":
          append({
            role: "assistant",
            content: [
              {
                type: "text",
                text: t("agent.terminal.approvalDenied", {
                  tool: terminal.toolName,
                }),
              },
            ],
          });
          return;
        case "model_error":
          append({
            role: "assistant",
            content: [
              {
                type: "text",
                text: t("agent.terminal.modelError", {
                  message: errorMessage(terminal.error),
                }),
              },
            ],
          });
          return;
      }
    },
    [append, t],
  );

  const handleStop = useCallback(() => {
    if (agentStopping || !useAgentStore.getState().agentRunning) {
      return;
    }
    setAgentStopping(true);
    abortActiveAgentRun();
  }, [agentStopping, setAgentStopping]);

  const runAgentLoop = useCallback(
    async (chatMessages: AgentMessage[]) => {
      const config = getActiveProvider();
      if (!config || !hasActiveProvider()) {
        return;
      }

      abortActiveAgentRun();
      const controller = new AbortController();
      setActiveAgentAbort(controller);

      setStreaming({ text: "", thinking: "" });
      setAgentRunning(true);
      setAgentStopping(false);

      let accumulatedText = "";
      let accumulatedThinking = "";
      const runningLabel = t("agent.tool.running");

      const storeAdapter = buildAgentStoreAdapter();
      const boxOpen = useAgentStore.getState().boxOpen;
      const deps: AgentDeps = {
        db,
        llm: createProvider(config),
        store: storeAdapter,
        signal: controller.signal,
        requestApproval: makeApprovalFn(storeAdapter),
        projectId,
        providerConfig: config,
      };

      try {
        const generator = runAgent(
          {
            messages: chatMessages,
            tools: buildResearchTools({ allowWeb, allowCode }),
            system: buildAgentSystemPrompt({
              projectName,
              date: new Date().toISOString().slice(0, 10),
              boxOpen,
            }),
            onEvent: (event) => {
              if (event.type === "thinking_delta") {
                accumulatedThinking += event.text;
                setStreaming({ thinking: accumulatedThinking });
              }
              if (event.type === "text_delta") {
                accumulatedText += event.text;
                setStreaming({ text: accumulatedText });
              }
              if (event.type === "tool_use_start") {
                useAgentStore.getState().startStreamingTool(event.id, event.name);
              }
              if (event.type === "tool_use_input_delta") {
                useAgentStore.getState().appendStreamingToolInput(
                  event.id,
                  event.partialJson,
                );
              }
            },
          },
          deps,
          runTools,
        );

        let step = await generator.next();
        while (!step.done) {
          const message = step.value;
          if (message.role === "assistant") {
            setStreaming({ text: "", thinking: "" });
            useAgentStore.getState().clearStreamingTools();
            accumulatedText = "";
            accumulatedThinking = "";
          }
          append(message);
          processToolBlocks(message, runningLabel, toolNameByUseIdRef.current);
          step = await generator.next();
        }

        const terminal = step.value;
        appendTerminalNotice(terminal);
      } catch (error) {
        if (!controller.signal.aborted) {
          append({
            role: "assistant",
            content: [
              {
                type: "text",
                text: t("agent.error.generic", {
                  message: errorMessage(error),
                }),
              },
            ],
          });
        }
      } finally {
        setStreaming({ text: "", thinking: "" });
        useAgentStore.getState().clearStreamingTools();
        setAgentRunning(false);
        setAgentStopping(false);
        setActiveAgentAbort(null);
        await persistSession();
      }
    },
    [
      append,
      allowCode,
      allowWeb,
      appendTerminalNotice,
      getActiveProvider,
      hasActiveProvider,
      projectId,
      projectName,
      persistSession,
      setStreaming,
      setAgentRunning,
      setAgentStopping,
      t,
    ],
  );

  const handleSend = useCallback(
    async (payload: ChatSendPayload) => {
      const config = getActiveProvider();
      if (!config || !hasActiveProvider() || agentRunning) {
        return;
      }

      const sendImagesDirectly = modelSupportsImageInput(config.openRouterMeta);
      const hasProvidedOcr =
        payload.ocrTexts != null && payload.ocrTexts.length === payload.images.length;
      const needsOcr = payload.images.length > 0 && !sendImagesDirectly && !hasProvidedOcr;

      const content = buildUserMessageBlocks({
        text: payload.text,
        images: payload.images,
        sendImagesDirectly,
        ocrTexts: hasProvidedOcr ? payload.ocrTexts : undefined,
        ocrPending: needsOcr,
      });
      if (content.length === 0) {
        return;
      }

      const userMessage: AgentMessage = {
        role: "user",
        content,
      };
      append(userMessage);
      useAgentStore.getState().commitRecommendationOnSend();
      const messageIndex = useAgentStore.getState().messages.length - 1;

      if (needsOcr) {
        try {
          const ocrTexts = await ocrImages(
            payload.images.map(
              (image) => `data:${image.mediaType};base64,${image.data}`,
            ),
          );
          const currentMessage = useAgentStore.getState().messages[messageIndex];
          if (currentMessage?.role === "user") {
            updateMessageAtIndex(messageIndex, {
              role: "user",
              content: applyOcrTextsToContent(currentMessage.content, ocrTexts),
            });
          }
        } catch (error) {
          const currentMessage = useAgentStore.getState().messages[messageIndex];
          if (currentMessage?.role === "user") {
            updateMessageAtIndex(messageIndex, {
              role: "user",
              content: applyOcrTextsToContent(
                currentMessage.content,
                payload.images.map(() => ""),
              ),
            });
          }
          append({
            role: "assistant",
            content: [
              {
                type: "text",
                text: t("agent.error.generic", {
                  message: errorMessage(error),
                }),
              },
            ],
          });
          return;
        }
      }

      await runAgentLoop([...useAgentStore.getState().messages]);
    },
    [
      append,
      getActiveProvider,
      hasActiveProvider,
      runAgentLoop,
      agentRunning,
      t,
      updateMessageAtIndex,
    ],
  );

  const handleResendUserMessage = useCallback(
    async (index: number, payload: ChatSendPayload) => {
      if (agentRunning) {
        return;
      }
      const message = useAgentStore.getState().messages[index];
      if (!message || message.role !== "user") {
        return;
      }
      truncateMessages(index);
      await handleSend(payload);
    },
    [handleSend, agentRunning, truncateMessages],
  );

  const handleRetryAssistantMessage = useCallback(
    async (index: number) => {
      if (agentRunning) {
        return;
      }
      truncateMessages(index);
      const chatMessages = useAgentStore.getState().messages;
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (!lastMessage || lastMessage.role !== "user") {
        return;
      }
      await runAgentLoop(chatMessages);
    },
    [runAgentLoop, agentRunning, truncateMessages],
  );

  const providerReady = hasActiveProvider();

  return (
    <main className="relative z-10 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden md:h-dvh">
      {!providerReady ? (
        <div className="mx-auto min-w-0 max-w-3xl flex-1 px-4 py-10">
          <header className="mb-6">
            <CurrentProjectLabel />
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-[var(--rb-border)] bg-[var(--rb-card-bg)] text-[var(--rb-text-secondary)]">
                <FeatureIcon id="chat-box" className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-[var(--rb-text-primary)]">
                  {t("agent.title")}
                </h1>
                <p className="mt-1 text-sm text-[var(--rb-text-secondary)]">
                  {t("agent.subtitle")}
                </p>
              </div>
            </div>
          </header>

          <section className="rounded-sm border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-6 py-8 shadow-sm">
            <p className="text-sm text-[var(--rb-text-secondary)]">
              {t("agent.noProvider")}
            </p>
            <Link
              to="/settings"
              className="mt-3 inline-block text-sm text-[var(--rb-primary)] hover:underline"
            >
              {t("agent.noProviderLink")}
            </Link>
          </section>
        </div>
      ) : (
        <AgentChatPanel
          contextWindow={contextWindow}
          disabled={agentRunning}
          projectId={projectId}
          onSend={handleSend}
          onStop={handleStop}
          stopping={agentStopping}
          onResendUserMessage={handleResendUserMessage}
          onRetryAssistantMessage={(index) => {
            void handleRetryAssistantMessage(index);
          }}
        />
      )}
    </main>
  );
}
