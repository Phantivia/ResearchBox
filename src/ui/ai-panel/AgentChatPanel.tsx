import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "./ChatComposer";
import { ContextMeter } from "./ContextMeter";
import { MessageBubble } from "./MessageBubble";
import { ThinkingBlock } from "./ThinkingBlock";

type MockMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingStreaming?: boolean;
};

const INITIAL_MESSAGES: MockMessage[] = [
  {
    id: "1",
    role: "user",
    content: "请简要说明 Transformer 的核心思想。",
  },
  {
    id: "2",
    role: "assistant",
    thinking:
      "用户想要一个简洁概述。应覆盖 self-attention、并行化、位置编码，避免过深数学推导。",
    content:
      "Transformer 用 **self-attention** 让序列中每个位置直接关注其他位置，从而并行处理整句，而不像 RNN 逐步传递。\n\n- 多头注意力捕捉不同关系\n- 位置编码注入顺序信息\n- 编码器-解码器堆叠完成序列到序列映射",
  },
  {
    id: "3",
    role: "user",
    content: "和 RNN 相比主要优势是什么？",
  },
  {
    id: "4",
    role: "assistant",
    thinking: "对比维度：并行度、长程依赖、训练效率。",
    thinkingStreaming: true,
    content: "主要优势是**训练并行**与**长程依赖**建模更直接；缺点是计算与内存随序列长度平方增长。",
  },
];

const MOCK_CONTEXT_WINDOW = 128_000;
const MOCK_TOKENS = 24_500;

export function AgentChatPanel() {
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);
  const [tokens, setTokens] = useState(MOCK_TOKENS);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text: string) => {
    const userMessage: MockMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantMessage: MockMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      thinking: "（占位）正在组织回复…",
      thinkingStreaming: true,
      content: `收到：「${text}」。真实模型接线将在下一步接入。`,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setTokens((current) => Math.min(MOCK_CONTEXT_WINDOW, current + text.length * 2 + 120));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--rb-page-bg)]">
      <ContextMeter tokens={tokens} contextWindow={MOCK_CONTEXT_WINDOW} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((message) => (
            <div key={message.id} className="flex flex-col gap-2">
              {message.role === "assistant" && message.thinking ? (
                <ThinkingBlock
                  text={message.thinking}
                  streaming={message.thinkingStreaming}
                />
              ) : null}
              <MessageBubble role={message.role}>{message.content}</MessageBubble>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatComposer disabled={false} onSend={handleSend} />
    </div>
  );
}
