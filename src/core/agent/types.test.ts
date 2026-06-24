import { describe, it, expect } from "vitest";
import { AgentMessageSchema } from "./types";
import type { AgentDeps } from "./types";

describe("AgentMessageSchema", () => {
  it("parses a valid user message", () => {
    const message = AgentMessageSchema.parse({
      role: "user",
      content: [{ type: "text", text: "Summarize section 2." }],
    });

    expect(message.role).toBe("user");
    expect(message.content).toEqual([
      { type: "text", text: "Summarize section 2." },
    ]);
  });

  it("rejects an invalid role", () => {
    const result = AgentMessageSchema.safeParse({
      role: "system",
      content: [{ type: "text", text: "hello" }],
    });

    expect(result.success).toBe(false);
  });
});

describe("AgentDeps", () => {
  it("accepts optional projectId for workspace-scoped tools", () => {
    const deps: AgentDeps = {
      db: {} as AgentDeps["db"],
      llm: { id: "fake", chat: async () => "" },
      store: {} as AgentDeps["store"],
      signal: new AbortController().signal,
      requestApproval: async () => true,
      projectId: "proj-1",
    };

    expect(deps.projectId).toBe("proj-1");
  });
});
