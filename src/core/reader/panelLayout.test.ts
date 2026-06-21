import { describe, expect, it } from "vitest";
import { clampAnnotationPanelWidth } from "./panelLayout";

describe("clampAnnotationPanelWidth", () => {
  it("clamps to configured bounds", () => {
    expect(clampAnnotationPanelWidth(100)).toBe(220);
    expect(clampAnnotationPanelWidth(300)).toBe(300);
    expect(clampAnnotationPanelWidth(900)).toBe(520);
  });
});
