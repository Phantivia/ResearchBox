import { describe, expect, it } from "vitest";
import { extractCopyableText } from "./messageText";

describe("extractCopyableText", () => {
  it("joins text and thinking blocks", () => {
    const text = extractCopyableText({
      role: "assistant",
      content: [
        { type: "thinking", text: "Planning…" },
        { type: "text", text: "Hello" },
      ],
    });
    expect(text).toBe("Planning…\n\nHello");
  });

  it("returns user message text", () => {
    const text = extractCopyableText({
      role: "user",
      content: [{ type: "text", text: "What is kernel LLM?" }],
    });
    expect(text).toBe("What is kernel LLM?");
  });
});
