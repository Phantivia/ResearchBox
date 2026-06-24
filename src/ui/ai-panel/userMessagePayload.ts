import type { AgentMessage, ContentBlock } from "@/core/agent/types";
import { messageHasOcrFallback, parseLegacyOcrText } from "@/core/agent/multimodal";
import type { ChatSendPayload } from "./ChatComposer";
import type { PendingImageAttachment } from "./imageAttachments";

export type UserMessageSendPayload = ChatSendPayload & {
  ocrTexts?: string[];
};

export type UserMessageOcrItem = {
  image: Extract<ContentBlock, { type: "image" }>;
  ocrText: string;
  imageName: string;
  ocrPending: boolean;
};

export type UserMessageDisplay = {
  text: string;
  directImages: Extract<ContentBlock, { type: "image" }>[];
  ocrItems: UserMessageOcrItem[];
  legacyOcrSections: Array<{ imageName: string; ocrText: string }>;
};

function imageToAttachment(
  block: Extract<ContentBlock, { type: "image" }>,
  index: number,
  name?: string,
): PendingImageAttachment {
  return {
    id: crypto.randomUUID(),
    mediaType: block.mediaType,
    data: block.data,
    previewUrl: `data:${block.mediaType};base64,${block.data}`,
    name: name ?? `image-${index + 1}`,
  };
}

export function parseUserMessageDisplay(message: AgentMessage): UserMessageDisplay {
  const textBlocks = message.content.filter(
    (block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text",
  );
  const text = textBlocks.map((block) => block.text).join("\n\n");
  const imageBlocks = message.content.filter(
    (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image",
  );
  const ocrBlocks = message.content.filter(
    (block): block is Extract<ContentBlock, { type: "ocr_text" }> => block.type === "ocr_text",
  );

  if (messageHasOcrFallback(message.content)) {
    return {
      text,
      directImages: [],
      ocrItems: imageBlocks.map((image, index) => ({
        image,
        ocrText: ocrBlocks[index]?.text ?? "",
        imageName: ocrBlocks[index]?.imageName ?? `image-${index + 1}`,
        ocrPending: ocrBlocks[index]?.pending === true,
      })),
      legacyOcrSections: [],
    };
  }

  const legacy = parseLegacyOcrText(text);
  if (legacy) {
    return {
      text: legacy.userText,
      directImages: imageBlocks,
      ocrItems: [],
      legacyOcrSections: legacy.sections,
    };
  }

  return {
    text,
    directImages: imageBlocks,
    ocrItems: [],
    legacyOcrSections: [],
  };
}

export function userMessageToSendPayload(message: AgentMessage): UserMessageSendPayload {
  const display = parseUserMessageDisplay(message);

  if (display.ocrItems.length > 0) {
    return {
      text: display.text,
      images: display.ocrItems.map((item, index) =>
        imageToAttachment(item.image, index, item.imageName),
      ),
      ocrTexts: display.ocrItems.map((item) => item.ocrText),
    };
  }

  if (display.legacyOcrSections.length > 0) {
    return {
      text: display.text,
      images: display.directImages.map((block, index) =>
        imageToAttachment(block, index, display.legacyOcrSections[index]?.imageName),
      ),
      ocrTexts: display.legacyOcrSections.map((section) => section.ocrText),
    };
  }

  return {
    text: display.text,
    images: display.directImages.map((block, index) => imageToAttachment(block, index)),
  };
}
