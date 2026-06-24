import { describe, expect, it } from "vitest";
import {
  recommendationNoticeLabel,
  recommendationPrefixEntry,
  truncateRecommendationTitle,
} from "./display";

describe("recommendation display", () => {
  it("truncates long titles with ellipsis", () => {
    const long = "A".repeat(60);
    expect(truncateRecommendationTitle(long, 48)).toBe(`${"A".repeat(47)}…`);
  });

  it("builds notice and prefix labels with truncated title", () => {
    const title = "Attention Is All You Need: A Very Long Subtitle That Keeps Going";
    expect(recommendationNoticeLabel(title, "1706.03762")).toContain("1706.03762");
    expect(recommendationNoticeLabel(title, "1706.03762").length).toBeLessThan(80);
    expect(recommendationPrefixEntry(title, "1706.03762")).toContain("1706.03762");
  });
});
