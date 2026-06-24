import { describe, expect, it } from "vitest";
import { linkifyArtifactCitations, splitMarkdownWithMath } from "./artifactMarkdown";

describe("linkifyArtifactCitations", () => {
  it("wraps bracketed paperId#blockId citations in cite links", () => {
    const input = "See [2401.12345:v1#blk-1] for details.";
    expect(linkifyArtifactCitations(input)).toBe(
      "See [2401.12345:v1#blk-1](cite:2401.12345%3Av1%23blk-1) for details.",
    );
  });
});

describe("splitMarkdownWithMath", () => {
  it("splits display and inline math segments", () => {
    const segments = splitMarkdownWithMath("Text $x^2$ and $$y=1$$ end");
    expect(segments).toEqual([
      { kind: "text", value: "Text " },
      { kind: "math", tex: "x^2", display: false },
      { kind: "text", value: " and " },
      { kind: "math", tex: "y=1", display: true },
      { kind: "text", value: " end" },
    ]);
  });
});
