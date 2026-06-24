import { describe, expect, it } from "vitest";
import {
  buildBoundaryMarker,
  IN_BOX_PRIORITY_RULE,
  isBoundaryMarker,
} from "./boundary";

describe("buildBoundaryMarker", () => {
  it("returns a user text message with boundary marker wording", () => {
    const marker = buildBoundaryMarker();

    expect(marker.role).toBe("user");
    expect(marker.content).toHaveLength(1);
    expect(marker.content[0]).toEqual({
      type: "text",
      text: expect.stringContaining("【盒子已关闭】"),
    });

    const text = marker.content[0]?.type === "text" ? marker.content[0].text : "";
    expect(text).toContain("从此标记起");
    expect(text).toContain("绝对优先使用盒内论文内容");
    expect(text).toContain("paperId#blockId");
    expect(text).toContain("盒内确实没有相关依据");
    expect(text).toContain("此点来自盒外、尚未正式纳入盒子");
  });
});

describe("isBoundaryMarker", () => {
  it("returns true for a boundary marker message", () => {
    expect(isBoundaryMarker(buildBoundaryMarker())).toBe(true);
  });

  it("returns false for regular user and assistant messages", () => {
    expect(
      isBoundaryMarker({
        role: "user",
        content: [{ type: "text", text: "hello" }],
      }),
    ).toBe(false);
    expect(
      isBoundaryMarker({
        role: "assistant",
        content: [{ type: "text", text: "【盒子已关闭】fake" }],
      }),
    ).toBe(false);
  });
});

describe("IN_BOX_PRIORITY_RULE", () => {
  it("states in-box priority and transparent out-of-box fallback", () => {
    expect(IN_BOX_PRIORITY_RULE).toContain("盒子关闭后");
    expect(IN_BOX_PRIORITY_RULE).toContain("绝对优先使用盒内论文内容");
    expect(IN_BOX_PRIORITY_RULE).toContain("paperId#blockId");
    expect(IN_BOX_PRIORITY_RULE).toContain("盒内确实没有相关依据");
    expect(IN_BOX_PRIORITY_RULE).toContain("此点来自盒外、尚未正式纳入盒子");
  });
});
