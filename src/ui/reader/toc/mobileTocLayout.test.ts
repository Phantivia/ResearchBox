import { describe, expect, it } from "vitest";
import {
  mobileTocFloatFromScrollTop,
  mobileTocItemHeight,
  mobileTocScrollTopForIndex,
} from "./mobileTocLayout";

describe("mobileTocItemHeight", () => {
  it("uses minimum height for short titles", () => {
    expect(mobileTocItemHeight("Intro", 1)).toBe(52);
  });

  it("extends height for longer titles", () => {
    const short = mobileTocItemHeight("Background", 1);
    const long = mobileTocItemHeight(
      "A much longer section title that should wrap onto multiple lines",
      1,
    );
    expect(long).toBeGreaterThan(short);
  });

  it("accounts for deeper heading levels", () => {
    const level1 = mobileTocItemHeight("Implementation details overview", 1);
    const level3 = mobileTocItemHeight("Implementation details overview", 3);
    expect(level3).toBeGreaterThanOrEqual(level1);
  });
});

describe("mobileToc scroll mapping", () => {
  const heights = [52, 74, 52];

  it("maps scrollTop back to fractional index", () => {
    expect(mobileTocFloatFromScrollTop(0, heights)).toBe(0);
    expect(mobileTocFloatFromScrollTop(26, heights)).toBeCloseTo(0.5, 5);
    expect(mobileTocFloatFromScrollTop(52, heights)).toBeCloseTo(1, 5);
  });

  it("maps index to scrollTop offset", () => {
    expect(mobileTocScrollTopForIndex(0, heights)).toBe(0);
    expect(mobileTocScrollTopForIndex(1, heights)).toBe(52);
    expect(mobileTocScrollTopForIndex(2, heights)).toBe(126);
  });
});
