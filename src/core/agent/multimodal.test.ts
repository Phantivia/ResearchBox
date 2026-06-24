import { describe, expect, it } from "vitest";
import {
  buildUserMessageBlocks,
  formatOcrBlock,
  isSupportedImageMediaType,
  modelSupportsImageInput,
} from "./multimodal";

describe("modelSupportsImageInput", () => {
  it("returns true when input modalities include image", () => {
    expect(
      modelSupportsImageInput({
        source: "openrouter",
        fetchedAt: 0,
        openRouterId: "openai/gpt-4o",
        name: "GPT-4o",
        contextLength: 128_000,
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        supportedParameters: [],
      }),
    ).toBe(true);
  });

  it("returns false when metadata is missing or has no image input", () => {
    expect(modelSupportsImageInput(null)).toBe(false);
    expect(
      modelSupportsImageInput({
        source: "openrouter",
        fetchedAt: 0,
        openRouterId: "deepseek/deepseek-chat",
        name: "DeepSeek Chat",
        contextLength: 64_000,
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportedParameters: [],
      }),
    ).toBe(false);
  });
});

describe("buildUserMessageBlocks", () => {
  const image = {
    mediaType: "image/png" as const,
    data: "abc123",
    name: "scan.png",
  };

  it("embeds image blocks when direct image input is supported", () => {
    expect(
      buildUserMessageBlocks({
        text: "What is this?",
        images: [image],
        sendImagesDirectly: true,
      }),
    ).toEqual([
      { type: "text", text: "What is this?" },
      { type: "image", mediaType: "image/png", data: "abc123" },
    ]);
  });

  it("merges OCR text into a single text block when image input is unsupported", () => {
    expect(
      buildUserMessageBlocks({
        text: "Summarize this image",
        images: [image],
        sendImagesDirectly: false,
        ocrTexts: ["Hello OCR"],
      }),
    ).toEqual([
      {
        type: "text",
        text: "Summarize this image\n\n[Image: scan.png]\nHello OCR",
      },
    ]);
  });

  it("handles OCR-only submissions without user text", () => {
    expect(
      buildUserMessageBlocks({
        text: "",
        images: [image],
        sendImagesDirectly: false,
        ocrTexts: [""],
      }),
    ).toEqual([
      {
        type: "text",
        text: "[Image: scan.png]\n(OCR found no text)",
      },
    ]);
  });
});

describe("formatOcrBlock", () => {
  it("labels empty OCR output", () => {
    expect(formatOcrBlock("photo.jpg", "  ")).toBe(
      "[Image: photo.jpg]\n(OCR found no text)",
    );
  });
});

describe("isSupportedImageMediaType", () => {
  it("accepts common image MIME types", () => {
    expect(isSupportedImageMediaType("image/png")).toBe(true);
    expect(isSupportedImageMediaType("application/pdf")).toBe(false);
  });
});
