import { describe, it, expect } from "vitest";
import { AgentMessageSchema } from "./types";

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
