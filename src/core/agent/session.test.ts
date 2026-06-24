import { describe, expect, it } from "vitest";
import { deriveSessionTitle, searchSessions, type AgentSession } from "./session";
import type { AgentMessage } from "@/core/agent/types";

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const now = Date.now();
  return {
    projectId: "proj-1",
    title: "Default title",
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function userMessage(text: string): AgentMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

describe("deriveSessionTitle", () => {
  it("uses the first user text message", () => {
    expect(deriveSessionTitle([userMessage("Explain transformers")])).toBe(
      "Explain transformers",
    );
  });
});

describe("searchSessions", () => {
  it("matches session title case-insensitively", () => {
    const sessions = [
      makeSession({ id: 1, title: "Alpha Chat", updatedAt: 100 }),
      makeSession({ id: 2, title: "Beta Notes", updatedAt: 200 }),
    ];

    const result = searchSessions(sessions, "alpha");
    expect(result.map((session) => session.id)).toEqual([1]);
  });

  it("matches message body text case-insensitively", () => {
    const sessions = [
      makeSession({
        id: 1,
        title: "Untitled",
        messages: [userMessage("Compare BERT and GPT")],
        updatedAt: 100,
      }),
      makeSession({
        id: 2,
        title: "Other",
        messages: [userMessage("Hello world")],
        updatedAt: 200,
      }),
    ];

    const result = searchSessions(sessions, "bert");
    expect(result.map((session) => session.id)).toEqual([1]);
  });

  it("sorts matches by updatedAt descending", () => {
    const sessions = [
      makeSession({ id: 1, title: "Shared keyword", updatedAt: 100 }),
      makeSession({ id: 2, title: "Shared keyword", updatedAt: 300 }),
      makeSession({ id: 3, title: "Shared keyword", updatedAt: 200 }),
    ];

    const result = searchSessions(sessions, "shared");
    expect(result.map((session) => session.id)).toEqual([2, 3, 1]);
  });

  it("returns all sessions sorted by updatedAt when query is empty", () => {
    const sessions = [
      makeSession({ id: 1, title: "Old", updatedAt: 50 }),
      makeSession({ id: 2, title: "New", updatedAt: 500 }),
      makeSession({ id: 3, title: "Mid", updatedAt: 250 }),
    ];

    expect(searchSessions(sessions, "").map((session) => session.id)).toEqual([2, 3, 1]);
    expect(searchSessions(sessions, "   ").map((session) => session.id)).toEqual([2, 3, 1]);
  });
});
