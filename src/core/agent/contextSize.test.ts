import { describe, expect, it } from "vitest";
import {
  contextUsageRatio,
  estimateChars,
  estimateContextBreakdown,
  estimateTokens,
  totalContextTokens,
} from "./contextSize";
import type { AgentMessage } from "./types";

describe("estimateChars", () => {
  it("returns 0 for an empty message list", () => {
    expect(estimateChars([])).toBe(0);
  });

  it("counts text, thinking, and tool_result characters", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "hello" },
          { type: "thinking", text: "12345" },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolUseId: "t1", content: "ok" }],
      },
    ];

    expect(estimateChars(messages)).toBe(5 + 5 + 2);
  });

  it("excludes llmHidden messages from character count", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        llmHidden: true,
        content: [
          {
            type: "artifact_card",
            artifactId: "a1",
            title: "ignored",
            kind: "note",
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "hi" }],
      },
    ];

    expect(estimateChars(messages)).toBe(2);
  });

  it("includes tool_use input via JSON.stringify length", () => {
    const input = { query: "paper", limit: 3 };
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "retrieval",
            input,
          },
        ],
      },
    ];

    expect(estimateChars(messages)).toBe(JSON.stringify(input).length);
  });
});

describe("estimateTokens", () => {
  it("returns 0 for an empty message list", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("uses the 4-char heuristic for Latin text", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "abcd" }],
      },
    ];

    expect(estimateTokens(messages)).toBe(1);
  });

  it("uses the 1.5-char heuristic for CJK text", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "你好" }],
      },
    ];

    expect(estimateTokens(messages)).toBe(2);
  });

  it("counts tool_use input tokens from stringified JSON", () => {
    const input = { q: "x" };
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "search",
            input,
          },
        ],
      },
    ];

    expect(estimateTokens(messages)).toBe(
      Math.ceil(JSON.stringify(input).length / 4),
    );
  });
});

describe("estimateContextBreakdown", () => {
  it("counts system prompt tokens separately", () => {
    const breakdown = estimateContextBreakdown([], "abcd");
    expect(breakdown.systemPrompt).toBe(1);
    expect(breakdown.conversation).toBe(0);
    expect(breakdown.toolUse).toBe(0);
    expect(breakdown.toolResult).toBe(0);
  });

  it("categorizes conversation, tool_use, and tool_result blocks", () => {
    const input = { q: "x" };
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "abcd" }],
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", text: "abcd" },
          {
            type: "tool_use",
            id: "call_1",
            name: "search",
            input,
          },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolUseId: "call_1", content: "abcd" }],
      },
    ];

    const breakdown = estimateContextBreakdown(messages, "abcd");
    expect(breakdown.systemPrompt).toBe(1);
    expect(breakdown.conversation).toBe(2);
    expect(breakdown.toolUse).toBe(Math.ceil(JSON.stringify(input).length / 4));
    expect(breakdown.toolResult).toBe(1);
    expect(totalContextTokens(breakdown)).toBe(estimateTokens(messages) + 1);
  });

  it("excludes llmHidden messages from breakdown", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        llmHidden: true,
        content: [
          {
            type: "artifact_card",
            artifactId: "a1",
            title: "ignored title here",
            kind: "note",
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "abcd" }],
      },
    ];

    const breakdown = estimateContextBreakdown(messages);
    expect(breakdown.conversation).toBe(1);
    expect(totalContextTokens(breakdown)).toBe(1);
  });
});

describe("contextUsageRatio", () => {
  it("returns 0 when contextWindow is 0", () => {
    expect(contextUsageRatio(100, 0)).toBe(0);
  });

  it("returns 0 when contextWindow is negative", () => {
    expect(contextUsageRatio(100, -1)).toBe(0);
  });

  it("returns a ratio between 0 and 1", () => {
    expect(contextUsageRatio(50_000, 200_000)).toBe(0.25);
    expect(contextUsageRatio(300_000, 200_000)).toBe(1);
  });
});
