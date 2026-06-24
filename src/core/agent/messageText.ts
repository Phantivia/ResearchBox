import type { AgentMessage } from "./types";

export function extractCopyableText(message: AgentMessage): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text" || block.type === "thinking" || block.type === "ocr_text") {
      parts.push(block.text);
    }
  }
  return parts.join("\n\n").trim();
}
