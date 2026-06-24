import type { StoredOpenRouterModelMeta } from "@/core/llm/openrouterSchema";
import type { AgentMessage, ContentBlock } from "@/core/agent/types";

export const SUPPORTED_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

export type ImageInput = {
  mediaType: SupportedImageMediaType;
  data: string;
  name?: string;
};

export type OcrTextBlock = Extract<ContentBlock, { type: "ocr_text" }>;

export function isSupportedImageMediaType(
  value: string,
): value is SupportedImageMediaType {
  return (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

export function modelSupportsImageInput(
  meta: StoredOpenRouterModelMeta | null | undefined,
): boolean {
  if (!meta) {
    return false;
  }
  return meta.inputModalities.some(
    (modality) => modality.toLowerCase() === "image",
  );
}

export function formatOcrBlock(name: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `[Image: ${name}]\n(OCR found no text)`;
  }
  return `[Image: ${name}]\n${trimmed}`;
}

export function messageHasOcrFallback(content: ContentBlock[]): boolean {
  return content.some((block) => block.type === "ocr_text");
}

function buildOcrFallbackLlmBlocks(input: {
  text: string;
  images: ImageInput[];
  ocrTexts: string[];
}): ContentBlock[] {
  const trimmedText = input.text.trim();
  const sections: string[] = [];
  if (trimmedText) {
    sections.push(trimmedText);
  }

  if (input.images.length > 0) {
    const ocrSections = input.images.map((image, index) =>
      formatOcrBlock(image.name ?? `image-${index + 1}`, input.ocrTexts[index] ?? ""),
    );
    sections.push(ocrSections.join("\n\n"));
  }

  const combined = sections.join("\n\n").trim();
  if (!combined) {
    return [];
  }

  return [{ type: "text", text: combined }];
}

export function buildUserMessageBlocks(input: {
  text: string;
  images: ImageInput[];
  sendImagesDirectly: boolean;
  ocrTexts?: string[];
}): ContentBlock[] {
  const trimmedText = input.text.trim();
  const blocks: ContentBlock[] = [];

  if (input.sendImagesDirectly) {
    if (trimmedText) {
      blocks.push({ type: "text", text: trimmedText });
    }
    for (const image of input.images) {
      blocks.push({
        type: "image",
        mediaType: image.mediaType,
        data: image.data,
      });
    }
    return blocks;
  }

  if (trimmedText) {
    blocks.push({ type: "text", text: trimmedText });
  }

  for (const [index, image] of input.images.entries()) {
    blocks.push({
      type: "image",
      mediaType: image.mediaType,
      data: image.data,
    });
    blocks.push({
      type: "ocr_text",
      text: input.ocrTexts?.[index] ?? "",
      imageName: image.name ?? `image-${index + 1}`,
    });
  }

  return blocks;
}

export function userMessageContentForLlm(content: ContentBlock[]): ContentBlock[] {
  if (!messageHasOcrFallback(content)) {
    return content;
  }

  const userText = content
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();

  const images = content.filter(
    (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image",
  );
  const ocrBlocks = content.filter(
    (block): block is OcrTextBlock => block.type === "ocr_text",
  );

  return buildOcrFallbackLlmBlocks({
    text: userText,
    images: images.map((image, index) => ({
      mediaType: image.mediaType,
      data: image.data,
      name: ocrBlocks[index]?.imageName ?? `image-${index + 1}`,
    })),
    ocrTexts: ocrBlocks.map((block) => block.text),
  });
}

export function userMessageForLlm(message: AgentMessage): AgentMessage {
  if (message.role !== "user") {
    return message;
  }
  return {
    ...message,
    content: userMessageContentForLlm(message.content),
  };
}

const LEGACY_OCR_MARKER = "\n\n[Image:";

export function parseLegacyOcrText(text: string): {
  userText: string;
  sections: Array<{ imageName: string; ocrText: string }>;
} | null {
  const markerIndex = text.indexOf(LEGACY_OCR_MARKER);
  const ocrStart = markerIndex >= 0 ? markerIndex : text.startsWith("[Image:") ? 0 : -1;
  if (ocrStart < 0) {
    return null;
  }

  const userText = markerIndex >= 0 ? text.slice(0, markerIndex).trim() : "";
  const ocrBlob = text.slice(ocrStart).trim();
  const sections: Array<{ imageName: string; ocrText: string }> = [];
  const parts = ocrBlob.split("\n\n");

  for (const part of parts) {
    const match = /^\[Image: ([^\]]+)\]\n([\s\S]*)$/.exec(part.trim());
    if (!match) {
      return null;
    }
    const [, imageName, body = ""] = match;
    const normalizedBody = body.trim() === "(OCR found no text)" ? "" : body;
    sections.push({ imageName: imageName ?? "", ocrText: normalizedBody });
  }

  return sections.length > 0 ? { userText, sections } : null;
}
