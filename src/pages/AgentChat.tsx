import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { runAgent, type BatchExecutor } from "@/core/agent/loop";
import { makeApprovalFn } from "@/core/agent/approval";
import { executeBatched } from "@/core/agent/orchestrate";
import { buildAgentSystemPrompt } from "@/core/agent/systemPrompt";
import { buildResearchTools } from "@/core/agent/tools";
import type { AgentDeps, AgentMessage, AgentStore, ContentBlock, Terminal } from "@/core/agent/types";
import { estimateTokens } from "@/core/agent/contextSize";
import { createProvider } from "@/core/llm";
import { db } from "@/db";
import { useTranslation } from "@/i18n";
import { useAgentStore, usePaperStore, useProjectStore, useSettingsStore } from "@/store";
import { AgentChatPanel } from "@/ui/ai-panel";
import { CurrentProjectLabel } from "@/ui/shell/CurrentProjectLabel";
import { FeatureIcon } from "@/ui/shell/featureIcons";

const DEFAULT_CONTEXT_WINDOW = 200_000;

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
      return useAgentStore.getState().permissionMode;
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
  const { setRunningTool, clearRunningTool, bumpArtifactsVersion } = useAgentStore.getState();
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
  const setStreaming = useAgentStore((state) => state.setStreaming);
  const setContextChars = useAgentStore((state) => state.setContextChars);
  const loadForProject = usePaperStore((state) => state.loadForProject);

  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const toolNameByUseIdRef = useRef(new Map<string, string>());

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
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const providerConfig = getActiveProvider();
  const contextWindow = resolveContextWindow(
    providerConfig?.openRouterMeta?.contextLength,
  );

  useEffect(() => {
    const tokens = estimateTokens(
      messagesWithStreaming(messages, streamingText, streamingThinking),
    );
    setContextChars(tokens);
  }, [messages, streamingText, streamingThinking, setContextChars]);

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
    if (!abortRef.current || stopping) {
      return;
    }
    setStopping(true);
    abortRef.current.abort();
  }, [stopping]);

  const handleSend = useCallback(
    async (text: string) => {
      const config = getActiveProvider();
      if (!config || !hasActiveProvider() || sending) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: AgentMessage = {
        role: "user",
        content: [{ type: "text", text }],
      };
      append(userMessage);
      setStreaming({ text: "", thinking: "" });
      setSending(true);
      setStopping(false);

      const chatMessages = [...useAgentStore.getState().messages];
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
        setSending(false);
        setStopping(false);
        abortRef.current = null;
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
      sending,
      setStreaming,
      t,
    ],
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
                <FeatureIcon id="agent-chat" className="h-5 w-5" />
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
          disabled={sending}
          projectId={projectId}
          onSend={handleSend}
          onStop={handleStop}
          stopping={stopping}
        />
      )}
    </main>
  );
}
