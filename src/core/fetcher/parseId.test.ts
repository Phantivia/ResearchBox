import { describe, it, expect } from "vitest";
import { extractArxivIdFromInput, parseArxivId } from "./parseId";

describe("parseArxivId", () => {
  // --- New-style arXiv URLs ---

  it("parses /abs/ URL without version", () => {
    expect(parseArxivId("https://arxiv.org/abs/2401.12345")).toEqual({
      id: "2401.12345",
      version: null,
    });
  });

  it("parses /abs/ URL with version", () => {
    expect(parseArxivId("https://arxiv.org/abs/2401.12345v2")).toEqual({
      id: "2401.12345",
      version: "v2",
    });
  });

  it("parses /pdf/ URL without version", () => {
    expect(parseArxivId("https://arxiv.org/pdf/2401.12345")).toEqual({
      id: "2401.12345",
      version: null,
    });
  });

  it("parses /pdf/ URL with version", () => {
    expect(parseArxivId("https://arxiv.org/pdf/2401.12345v2")).toEqual({
      id: "2401.12345",
      version: "v2",
    });
  });

  it("parses /html/ URL with version", () => {
    expect(parseArxivId("https://arxiv.org/html/2401.12345v2")).toEqual({
      id: "2401.12345",
      version: "v2",
    });
  });

  // --- Bare IDs ---

  it("parses bare ID without version", () => {
    expect(parseArxivId("2401.12345")).toEqual({
      id: "2401.12345",
      version: null,
    });
  });

  it("parses bare ID with version", () => {
    expect(parseArxivId("2401.12345v2")).toEqual({
      id: "2401.12345",
      version: "v2",
    });
  });

  // --- Old-style IDs ---

  it("parses old-style ID (subject-class/YYMMnnn)", () => {
    expect(parseArxivId("math.GT/0309136")).toEqual({
      id: "math.GT/0309136",
      version: null,
    });
  });

  it("parses old-style ID with version", () => {
    expect(parseArxivId("math.GT/0309136v2")).toEqual({
      id: "math.GT/0309136",
      version: "v2",
    });
  });

  it("parses old-style ID without sub-category (hep-ph)", () => {
    expect(parseArxivId("hep-ph/9905221")).toEqual({
      id: "hep-ph/9905221",
      version: null,
    });
  });

  it("parses old-style ID in URL form", () => {
    expect(parseArxivId("https://arxiv.org/abs/math.GT/0309136v1")).toEqual({
      id: "math.GT/0309136",
      version: "v1",
    });
  });

  // --- Edge cases ---

  it("trims whitespace", () => {
    expect(parseArxivId("  2401.12345v2  ")).toEqual({
      id: "2401.12345",
      version: "v2",
    });
  });

  it("ignores query string", () => {
    expect(
      parseArxivId("https://arxiv.org/abs/2401.12345?context=cs.AI"),
    ).toEqual({
      id: "2401.12345",
      version: null,
    });
  });

  it("ignores anchor/fragment", () => {
    expect(parseArxivId("https://arxiv.org/abs/2401.12345#section1")).toEqual({
      id: "2401.12345",
      version: null,
    });
  });

  // --- Invalid inputs → null ---

  it("returns null for empty string", () => {
    expect(parseArxivId("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(parseArxivId("   ")).toBeNull();
  });

  it("returns null for random text", () => {
    expect(parseArxivId("hello world")).toBeNull();
  });

  it("returns null for non-arxiv URL", () => {
    expect(parseArxivId("https://google.com/search?q=arxiv")).toBeNull();
  });

  it("returns null for malformed ID", () => {
    expect(parseArxivId("2401")).toBeNull();
  });

  it("returns null for ID with too few digits after dot", () => {
    expect(parseArxivId("2401.12")).toBeNull();
  });
});

describe("extractArxivIdFromInput", () => {
  it("extracts the first new-style ID from free-form pasted text", () => {
    expect(
      extractArxivIdFromInput("see https://arxiv.org/abs/2401.12345v2 for details"),
    ).toEqual({
      id: "2401.12345",
      version: "v2",
    });
  });

  it("extracts ID from a truncated or malformed URL prefix", () => {
    expect(extractArxivIdFromInput("tps://arxiv.org/abs/2401.12345")).toEqual({
      id: "2401.12345",
      version: null,
    });
  });

  it("extracts old-style IDs embedded in text", () => {
    expect(extractArxivIdFromInput("paper math.GT/0309136v1 archived")).toEqual({
      id: "math.GT/0309136",
      version: "v1",
    });
  });

  it("falls back to strict parsing for well-formed bare IDs", () => {
    expect(extractArxivIdFromInput("2401.12345v2")).toEqual({
      id: "2401.12345",
      version: "v2",
    });
  });

  it("returns null when no arxiv-like ID is present", () => {
    expect(extractArxivIdFromInput("hello world")).toBeNull();
  });
});
