import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { runChat } from "@/core/agent/chatController";
import { estimateTokens } from "@/core/agent/contextSize";
import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { createProvider } from "@/core/llm";
import { useTranslation } from "@/i18n";
import { useAgentStore, useSettingsStore } from "@/store";
import { AgentChatPanel } from "@/ui/ai-panel";
import { CurrentProjectLabel } from "@/ui/shell/CurrentProjectLabel";
import { FeatureIcon } from "@/ui/shell/featureIcons";

const DEFAULT_CONTEXT_WINDOW = 200_000;
const AGENT_SYSTEM_PROMPT =
  "You are a helpful research assistant for ResearchBox. Answer clearly and concisely.";

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

export default function AgentChat() {
  const { t } = useTranslation();
  const {
    loaded: settingsLoaded,
    load: loadSettings,
    getActiveProvider,
    hasActiveProvider,
  } = useSettingsStore();
  const messages = useAgentStore((state) => state.messages);
  const streamingText = useAgentStore((state) => state.streamingText);
  const streamingThinking = useAgentStore((state) => state.streamingThinking);
  const append = useAgentStore((state) => state.append);
  const setStreaming = useAgentStore((state) => state.setStreaming);
  const commitStreamingToMessage = useAgentStore(
    (state) => state.commitStreamingToMessage,
  );
  const setContextChars = useAgentStore((state) => state.setContextChars);

  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!settingsLoaded) {
      void loadSettings();
    }
  }, [settingsLoaded, loadSettings]);

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

      const chatMessages = [...useAgentStore.getState().messages];
      let accumulatedText = "";
      let accumulatedThinking = "";

      try {
        await runChat({
          provider: createProvider(config),
          system: AGENT_SYSTEM_PROMPT,
          messages: chatMessages,
          signal: controller.signal,
          onThinkingDelta: (chunk) => {
            accumulatedThinking += chunk;
            setStreaming({ thinking: accumulatedThinking });
          },
          onDelta: (chunk) => {
            accumulatedText += chunk;
            setStreaming({ text: accumulatedText });
          },
          onDone: (result) => {
            setStreaming({ text: result.text, thinking: result.thinking });
            commitStreamingToMessage();
            setSending(false);
          },
          onError: (error) => {
            if (controller.signal.aborted) {
              return;
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
            setStreaming({ text: "", thinking: "" });
            setSending(false);
          },
        });
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
          setStreaming({ text: "", thinking: "" });
          setSending(false);
        }
      }
    },
    [
      append,
      commitStreamingToMessage,
      getActiveProvider,
      hasActiveProvider,
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
          onSend={handleSend}
        />
      )}
    </main>
  );
}
