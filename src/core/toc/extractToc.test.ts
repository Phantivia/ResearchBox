import { describe, expect, it } from "vitest";
import type { Block } from "@/core/ir";
import { extractToc } from "./extractToc";

function block(partial: Partial<Block> & Pick<Block, "id" | "type">): Block {
  return { content: "", ...partial };
}

describe("extractToc", () => {
  it("only keeps heading blocks in document order", () => {
    const toc = extractToc({
      blocks: [
        block({ id: "h1", type: "heading", level: 1, content: "Introduction" }),
        block({ id: "p1", type: "paragraph", content: "body text" }),
        block({ id: "h2", type: "heading", level: 2, content: "Background" }),
      ],
    });

    expect(toc).toEqual([
      { id: "h1", title: "Introduction", level: 1 },
      { id: "h2", title: "Background", level: 2 },
    ]);
  });

  it("strips html tags and collapses whitespace in titles", () => {
    const toc = extractToc({
      blocks: [
        block({
          id: "h",
          type: "heading",
          level: 2,
          content: "  <span>3.1</span>\n  Related   Work ",
        }),
      ],
    });

    expect(toc[0]).toEqual({ id: "h", title: "3.1 Related Work", level: 2 });
  });

  it("skips headings whose text is empty after stripping", () => {
    const toc = extractToc({
      blocks: [block({ id: "h", type: "heading", level: 1, content: "<span></span>" })],
    });

    expect(toc).toEqual([]);
  });

  it("defaults missing level to 1", () => {
    const toc = extractToc({
      blocks: [block({ id: "h", type: "heading", content: "Method" })],
    });

    expect(toc[0]?.level).toBe(1);
  });
});
