import type { AgentMessage } from "@/core/agent/types";
import type { ChatSendPayload } from "./ChatComposer";
import type { PendingImageAttachment } from "./imageAttachments";

export function userMessageToSendPayload(message: AgentMessage): ChatSendPayload {
  const text = message.content
    .filter((block): block is Extract<(typeof message.content)[number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  const images: PendingImageAttachment[] = message.content
    .filter((block): block is Extract<(typeof message.content)[number], { type: "image" }> => block.type === "image")
    .map((block, index) => ({
      id: crypto.randomUUID(),
      mediaType: block.mediaType,
      data: block.data,
      previewUrl: `data:${block.mediaType};base64,${block.data}`,
      name: `image-${index + 1}`,
    }));

  return { text, images };
}
