import { describe, it, expect } from "vitest";
import { letterBitmap, queryBitmap, passesPrefilter } from "./bitmapPrefilter";

function hasLetter(bitmap: number, letter: string): boolean {
  const code = letter.toLowerCase().charCodeAt(0) - "a".charCodeAt(0);
  return (bitmap & (1 << code)) !== 0;
}

describe("letterBitmap", () => {
  it("maps distinct a-z letters to a 26-bit bitmap", () => {
    const bitmap = letterBitmap("Hello World");
    expect(hasLetter(bitmap, "h")).toBe(true);
    expect(hasLetter(bitmap, "e")).toBe(true);
    expect(hasLetter(bitmap, "l")).toBe(true);
    expect(hasLetter(bitmap, "o")).toBe(true);
    expect(hasLetter(bitmap, "w")).toBe(true);
    expect(hasLetter(bitmap, "r")).toBe(true);
    expect(hasLetter(bitmap, "d")).toBe(true);
    expect(hasLetter(bitmap, "x")).toBe(false);
  });

  it("ignores non-letters and picks up Latin letters in mixed text", () => {
    const bitmap = letterBitmap("注意力机制 attention 123 !!!");
    expect(hasLetter(bitmap, "a")).toBe(true);
    expect(hasLetter(bitmap, "t")).toBe(true);
    expect(hasLetter(bitmap, "n")).toBe(true);
    expect(hasLetter(bitmap, "z")).toBe(false);
  });
});

describe("queryBitmap", () => {
  it("matches letterBitmap for query strings", () => {
    expect(queryBitmap("transformer")).toBe(letterBitmap("transformer"));
  });
});

describe("passesPrefilter", () => {
  it("passes when block contains all query letters", () => {
    const block = letterBitmap("transformer architecture paper");
    const query = queryBitmap("transformer");
    expect(passesPrefilter(block, query)).toBe(true);
  });

  it("rejects when block is missing a query letter", () => {
    const block = letterBitmap("attention is all you need");
    const query = queryBitmap("transformer");
    expect(passesPrefilter(block, query)).toBe(false);
  });

  it("passes all blocks when query has no letters", () => {
    expect(passesPrefilter(letterBitmap("abc"), queryBitmap("123 中文"))).toBe(
      true,
    );
  });

  it("uses (block & query) === query semantics", () => {
    const block = 0b10101;
    const query = 0b00101;
    expect(passesPrefilter(block, query)).toBe(true);
    expect(passesPrefilter(block, 0b11111)).toBe(false);
  });
});
