import { describe, expect, it } from "vitest";
import {
  mobileTocCardVisual,
  mobileTocPanelOpacity,
  mobileTocPanelScale,
} from "./mobileTocVisual";

describe("mobileTocPanelScale", () => {
  it("returns 1 for centered item", () => {
    expect(mobileTocPanelScale(0, true)).toBe(1);
  });

  it("places the nearest neighbor near 92% width", () => {
    expect(mobileTocPanelScale(1, false)).toBeCloseTo(0.92, 2);
  });

  it("decays progressively and stays faintly visible at distance 4", () => {
    const d2 = mobileTocPanelScale(2, false);
    const d3 = mobileTocPanelScale(3, false);
    const d4 = mobileTocPanelScale(4, false);
    expect(d2).toBeGreaterThan(0.5);
    expect(d3).toBeGreaterThan(d4);
    expect(d4).toBeGreaterThan(0.15);
  });

  it("shrinks items above center faster than below", () => {
    expect(mobileTocPanelScale(-2, false)).toBeLessThan(mobileTocPanelScale(2, false));
  });
});

describe("mobileTocPanelOpacity", () => {
  it("returns 1 for centered item", () => {
    expect(mobileTocPanelOpacity(0, true)).toBe(1);
  });

  it("decays progressively and stays faintly visible at distance 4", () => {
    const d1 = mobileTocPanelOpacity(1, false);
    const d2 = mobileTocPanelOpacity(2, false);
    const d3 = mobileTocPanelOpacity(3, false);
    const d4 = mobileTocPanelOpacity(4, false);
    expect(d1).toBeCloseTo(0.93, 2);
    expect(d2).toBeGreaterThan(d3);
    expect(d3).toBeGreaterThan(d4);
    expect(d4).toBeGreaterThan(0.2);
  });

  it("fades items above center faster than below", () => {
    expect(mobileTocPanelOpacity(-2, false)).toBeLessThan(mobileTocPanelOpacity(2, false));
  });
});

describe("mobileTocCardVisual", () => {
  it("returns full opacity and scale for centered item", () => {
    expect(mobileTocCardVisual(0, true)).toEqual({
      opacity: 1,
      scale: 1,
      zIndex: 20,
    });
  });

  it("elevates z-index only for centered item", () => {
    expect(mobileTocCardVisual(1, false).zIndex).toBe(0);
    expect(mobileTocCardVisual(0, true).zIndex).toBe(20);
  });
});
