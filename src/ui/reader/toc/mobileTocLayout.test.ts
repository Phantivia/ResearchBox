import { describe, expect, it } from "vitest";
import {
  MOBILE_TOC_ITEM_HEIGHT,
  mobileTocFloatFromScrollTop,
  mobileTocHeights,
  mobileTocScrollTopForIndex,
} from "./mobileTocLayout";

describe("mobileTocHeights", () => {
  it("gives every entry a uniform height", () => {
    expect(mobileTocHeights([{}, {}, {}])).toEqual([
      MOBILE_TOC_ITEM_HEIGHT,
      MOBILE_TOC_ITEM_HEIGHT,
      MOBILE_TOC_ITEM_HEIGHT,
    ]);
  });

  it("returns an empty array for no entries", () => {
    expect(mobileTocHeights([])).toEqual([]);
  });
});

describe("mobileToc scroll mapping", () => {
  const heights = [52, 52, 52];

  it("maps scrollTop back to fractional index", () => {
    expect(mobileTocFloatFromScrollTop(0, heights)).toBe(0);
    expect(mobileTocFloatFromScrollTop(26, heights)).toBeCloseTo(0.5, 5);
    expect(mobileTocFloatFromScrollTop(52, heights)).toBeCloseTo(1, 5);
  });

  it("maps index to scrollTop offset", () => {
    expect(mobileTocScrollTopForIndex(0, heights)).toBe(0);
    expect(mobileTocScrollTopForIndex(1, heights)).toBe(52);
    expect(mobileTocScrollTopForIndex(2, heights)).toBe(104);
  });
});
