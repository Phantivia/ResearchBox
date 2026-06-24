import { describe, expect, it } from "vitest";
import {
  applyOcrTextsToContent,
  buildUserMessageBlocks,
  formatOcrBlock,
  isSupportedImageMediaType,
  messageHasOcrFallback,
  messageHasPendingOcr,
  modelSupportsImageInput,
  parseLegacyOcrText,
  userMessageContentForLlm,
  userMessageForLlm,
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

  it("stores image and OCR blocks separately when image input is unsupported", () => {
    expect(
      buildUserMessageBlocks({
        text: "Summarize this image",
        images: [image],
        sendImagesDirectly: false,
        ocrTexts: ["Hello OCR"],
      }),
    ).toEqual([
      { type: "text", text: "Summarize this image" },
      { type: "image", mediaType: "image/png", data: "abc123" },
      { type: "ocr_text", text: "Hello OCR", imageName: "scan.png" },
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
      { type: "image", mediaType: "image/png", data: "abc123" },
      { type: "ocr_text", text: "", imageName: "scan.png" },
    ]);
  });

  it("marks OCR blocks as pending before recognition completes", () => {
    expect(
      buildUserMessageBlocks({
        text: "Summarize this image",
        images: [image],
        sendImagesDirectly: false,
        ocrPending: true,
      }),
    ).toEqual([
      { type: "text", text: "Summarize this image" },
      { type: "image", mediaType: "image/png", data: "abc123" },
      { type: "ocr_text", text: "", imageName: "scan.png", pending: true },
    ]);
  });
});

describe("applyOcrTextsToContent", () => {
  it("fills OCR text and clears pending flags", () => {
    const content = buildUserMessageBlocks({
      text: "Summarize",
      images: [{ mediaType: "image/png", data: "abc123", name: "scan.png" }],
      sendImagesDirectly: false,
      ocrPending: true,
    });

    expect(applyOcrTextsToContent(content, ["Recognized text"])).toEqual([
      { type: "text", text: "Summarize" },
      { type: "image", mediaType: "image/png", data: "abc123" },
      { type: "ocr_text", text: "Recognized text", imageName: "scan.png" },
    ]);
  });
});

describe("messageHasPendingOcr", () => {
  it("detects pending OCR blocks", () => {
    const pending = buildUserMessageBlocks({
      text: "",
      images: [{ mediaType: "image/png", data: "abc123", name: "scan.png" }],
      sendImagesDirectly: false,
      ocrPending: true,
    });
    const completed = applyOcrTextsToContent(pending, ["done"]);

    expect(messageHasPendingOcr(pending)).toBe(true);
    expect(messageHasPendingOcr(completed)).toBe(false);
  });
});

describe("userMessageContentForLlm", () => {
  it("merges OCR fallback blocks into a single text block for the LLM", () => {
    const content = buildUserMessageBlocks({
      text: "Summarize this image",
      images: [{ mediaType: "image/png", data: "abc123", name: "scan.png" }],
      sendImagesDirectly: false,
      ocrTexts: ["Hello OCR"],
    });

    expect(userMessageContentForLlm(content)).toEqual([
      {
        type: "text",
        text: "Summarize this image\n\n[Image: scan.png]\n(OCR result; may be inaccurate)\nHello OCR",
      },
    ]);
  });

  it("leaves direct-image messages unchanged", () => {
    const content = buildUserMessageBlocks({
      text: "What is this?",
      images: [{ mediaType: "image/png", data: "abc123", name: "scan.png" }],
      sendImagesDirectly: true,
    });

    expect(userMessageContentForLlm(content)).toEqual(content);
  });
});

describe("userMessageForLlm", () => {
  it("transforms only user messages", () => {
    const userMessage = {
      role: "user" as const,
      content: buildUserMessageBlocks({
        text: "",
        images: [{ mediaType: "image/png", data: "abc123", name: "scan.png" }],
        sendImagesDirectly: false,
        ocrTexts: ["Hello OCR"],
      }),
    };

    expect(messageHasOcrFallback(userMessage.content)).toBe(true);
    expect(userMessageForLlm(userMessage).content).toEqual([
      { type: "text", text: "[Image: scan.png]\n(OCR result; may be inaccurate)\nHello OCR" },
    ]);
  });
});

describe("formatOcrBlock", () => {
  it("labels empty OCR output", () => {
    expect(formatOcrBlock("photo.jpg", "  ")).toBe(
      "[Image: photo.jpg]\n(OCR found no text)",
    );
  });

  it("includes an accuracy disclaimer for non-empty OCR output", () => {
    expect(formatOcrBlock("photo.jpg", "Hello")).toBe(
      "[Image: photo.jpg]\n(OCR result; may be inaccurate)\nHello",
    );
  });
});

describe("parseLegacyOcrText", () => {
  it("extracts user text and OCR sections from legacy merged text", () => {
    expect(
      parseLegacyOcrText("Summarize this image\n\n[Image: scan.png]\nHello OCR"),
    ).toEqual({
      userText: "Summarize this image",
      sections: [{ imageName: "scan.png", ocrText: "Hello OCR" }],
    });
  });

  it("returns null when no legacy OCR marker is present", () => {
    expect(parseLegacyOcrText("Plain text only")).toBeNull();
  });
});

describe("isSupportedImageMediaType", () => {
  it("accepts common image MIME types", () => {
    expect(isSupportedImageMediaType("image/png")).toBe(true);
    expect(isSupportedImageMediaType("application/pdf")).toBe(false);
  });
});
