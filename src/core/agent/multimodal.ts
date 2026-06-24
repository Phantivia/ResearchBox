import type { StoredOpenRouterModelMeta } from "@/core/llm/openrouterSchema";
import type { ContentBlock } from "@/core/agent/types";

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

  const sections: string[] = [];
  if (trimmedText) {
    sections.push(trimmedText);
  }

  if (input.images.length > 0) {
    const ocrSections = input.images.map((image, index) =>
      formatOcrBlock(image.name ?? `image-${index + 1}`, input.ocrTexts?.[index] ?? ""),
    );
    sections.push(ocrSections.join("\n\n"));
  }

  const combined = sections.join("\n\n").trim();
  if (combined) {
    blocks.push({ type: "text", text: combined });
  }

  return blocks;
}
