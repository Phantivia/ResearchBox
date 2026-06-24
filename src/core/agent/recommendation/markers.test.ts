import { describe, expect, it } from "vitest";
import { buildBoundaryMarker } from "../boundary";
import {
  buildComposerPrefix,
  buildIgnoreMarker,
  buildIncludeMarker,
  editableRecommendationMarkerIndices,
  isRecommendationMarker,
  parseRecommendationMarker,
  removeEditableMarkersForArxiv,
  stripComposerPrefix,
} from "./markers";

describe("recommendation markers", () => {
  it("builds include and ignore markers with title", () => {
    expect(buildIncludeMarker("2401.12345", "My Paper").content[0]).toEqual({
      type: "text",
      text: "【已纳入推荐】2401.12345 — My Paper",
    });
    expect(buildIgnoreMarker("2401.12345", "My Paper").content[0]).toEqual({
      type: "text",
      text: "【已忽略推荐】2401.12345 — My Paper",
    });
  });

  it("parses and detects recommendation markers", () => {
    const include = buildIncludeMarker("2401.12345", "My Paper");
    expect(isRecommendationMarker(include)).toBe(true);
    expect(parseRecommendationMarker("【已纳入推荐】2401.12345 — My Paper")).toEqual({
      decision: "included",
      arxivId: "2401.12345",
      title: "My Paper",
    });
    expect(parseRecommendationMarker("【已忽略推荐】2401.99999")).toEqual({
      decision: "ignored",
      arxivId: "2401.99999",
      title: "",
    });
  });

  it("only treats trailing markers as editable after the last real user message", () => {
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "hello" }] },
      buildIncludeMarker("2401.1", "Paper 1"),
      buildIgnoreMarker("2401.2", "Paper 2"),
    ];
    expect(editableRecommendationMarkerIndices(messages)).toEqual([1, 2]);

    messages.push({
      role: "user",
      content: [{ type: "text", text: "follow up" }],
    });
    messages.push(buildIncludeMarker("2401.3", "Paper 3"));
    expect(editableRecommendationMarkerIndices(messages)).toEqual([4]);
  });

  it("removes editable markers for a specific arxiv id", () => {
    const messages = [
      buildIncludeMarker("2401.1", "Paper 1"),
      buildIgnoreMarker("2401.2", "Paper 2"),
      buildBoundaryMarker(),
    ];
    const next = removeEditableMarkersForArxiv(messages, "2401.1");
    expect(next).toHaveLength(2);
    expect(isRecommendationMarker(next[0]!)).toBe(true);
    expect(parseRecommendationMarker("【已忽略推荐】2401.2 — Paper 2")).toBeTruthy();
  });

  it("builds and strips composer prefix from decisions with titles", () => {
    const prefix = buildComposerPrefix(
      {
        "2401.1": "included",
        "2401.2": "ignored",
      },
      [
        {
          arxivId: "2401.1",
          title: "Paper One",
          abstract: "",
          reason: "",
        },
        {
          arxivId: "2401.2",
          title: "Paper Two",
          abstract: "",
          reason: "",
        },
      ],
    );
    expect(prefix).toContain("Paper One");
    expect(prefix).toContain("Paper Two");
    expect(stripComposerPrefix(`${prefix}继续提问`)).toBe("继续提问");
  });
});
