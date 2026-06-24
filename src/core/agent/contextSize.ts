import type { AgentMessage, ContentBlock } from "@/core/agent/types";

const CJK_CHAR = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

function blockText(block: ContentBlock): string {
  switch (block.type) {
    case "text":
    case "thinking":
      return block.text;
    case "tool_result":
      return block.content;
    case "tool_use":
      return JSON.stringify(block.input);
    case "artifact_card":
      return block.title;
  }
}

function estimateTokensFromString(text: string): number {
  let cjkChars = 0;
  let otherChars = 0;

  for (const char of text) {
    if (CJK_CHAR.test(char)) {
      cjkChars += 1;
    } else {
      otherChars += 1;
    }
  }

  return Math.ceil(cjkChars / 1.5) + Math.ceil(otherChars / 4);
}

export function estimateChars(messages: AgentMessage[]): number {
  let total = 0;

  for (const message of messages) {
    if (message.llmHidden) {
      continue;
    }
    for (const block of message.content) {
      total += blockText(block).length;
    }
  }

  return total;
}

export interface ContextTokenBreakdown {
  systemPrompt: number;
  conversation: number;
  toolUse: number;
  toolResult: number;
}

export const EMPTY_CONTEXT_BREAKDOWN: ContextTokenBreakdown = {
  systemPrompt: 0,
  conversation: 0,
  toolUse: 0,
  toolResult: 0,
};

export function totalContextTokens(breakdown: ContextTokenBreakdown): number {
  return (
    breakdown.systemPrompt +
    breakdown.conversation +
    breakdown.toolUse +
    breakdown.toolResult
  );
}

export function estimateContextBreakdown(
  messages: AgentMessage[],
  systemPrompt = "",
): ContextTokenBreakdown {
  const breakdown: ContextTokenBreakdown = {
    systemPrompt: estimateTokensFromString(systemPrompt),
    conversation: 0,
    toolUse: 0,
    toolResult: 0,
  };

  for (const message of messages) {
    if (message.llmHidden) {
      continue;
    }
    for (const block of message.content) {
      const tokens = estimateTokensFromString(blockText(block));
      switch (block.type) {
        case "text":
        case "thinking":
          breakdown.conversation += tokens;
          break;
        case "tool_use":
          breakdown.toolUse += tokens;
          break;
        case "tool_result":
          breakdown.toolResult += tokens;
          break;
        case "artifact_card":
          break;
      }
    }
  }

  return breakdown;
}

export function estimateTokens(messages: AgentMessage[]): number {
  return totalContextTokens(estimateContextBreakdown(messages));
}

export function contextUsageRatio(tokens: number, contextWindow: number): number {
  if (contextWindow <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, tokens / contextWindow));
}
