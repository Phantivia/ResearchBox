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
    for (const block of message.content) {
      total += blockText(block).length;
    }
  }

  return total;
}

export function estimateTokens(messages: AgentMessage[]): number {
  let total = 0;

  for (const message of messages) {
    for (const block of message.content) {
      total += estimateTokensFromString(blockText(block));
    }
  }

  return total;
}

export function contextUsageRatio(tokens: number, contextWindow: number): number {
  if (contextWindow <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, tokens / contextWindow));
}
