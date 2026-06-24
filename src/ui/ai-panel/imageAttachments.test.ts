import { describe, expect, it } from "vitest";
import { isSupportedImageMediaType } from "@/core/agent/multimodal";
import { isImageFile } from "./imageAttachments";

describe("imageAttachments", () => {
  it("detects supported image files by MIME type or extension", () => {
    expect(
      isImageFile(new File(["x"], "photo.png", { type: "image/png" })),
    ).toBe(true);
    expect(
      isImageFile(new File(["x"], "photo.jpg", { type: "" })),
    ).toBe(true);
    expect(
      isImageFile(new File(["x"], "notes.pdf", { type: "application/pdf" })),
    ).toBe(false);
  });

  it("reuses supported MIME types from core multimodal helpers", () => {
    expect(isSupportedImageMediaType("image/webp")).toBe(true);
    expect(isImageFile(new File(["x"], "photo.webp", { type: "image/webp" }))).toBe(true);
  });
});
