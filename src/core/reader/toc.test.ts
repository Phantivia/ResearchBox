import { describe, expect, it } from "vitest";
import type { Block } from "@/core/ir";
import {
  buildTocTree,
  flattenToc,
  stripHeadingHtml,
  truncateTitle,
} from "./toc";

function heading(id: string, level: number, content: string): Block {
  return { id, type: "heading", level, content };
}

describe("buildTocTree", () => {
  it("builds nested section / subsection hierarchy", () => {
    const blocks: Block[] = [
      heading("s1", 2, "Introduction"),
      heading("s1.1", 3, "Background"),
      heading("s1.2", 3, "Motivation"),
      heading("s2", 2, "Methods"),
      heading("s2.1", 3, "Dataset"),
    ];

    const tree = buildTocTree(blocks);
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({
      blockId: "s1",
      title: "Introduction",
      children: [
        { blockId: "s1.1", title: "Background" },
        { blockId: "s1.2", title: "Motivation" },
      ],
    });
    expect(tree[1]).toMatchObject({
      blockId: "s2",
      title: "Methods",
      children: [{ blockId: "s2.1", title: "Dataset" }],
    });
  });

  it("ignores non-heading blocks", () => {
    const blocks: Block[] = [
      heading("h1", 2, "Section"),
      { id: "p1", type: "paragraph", content: "body" },
    ];
    expect(buildTocTree(blocks)).toHaveLength(1);
  });
});

describe("stripHeadingHtml", () => {
  it("strips tags and normalizes whitespace", () => {
    expect(stripHeadingHtml("<span>Hello</span>  world")).toBe("Hello world");
  });
});

describe("flattenToc", () => {
  it("returns depth-first order", () => {
    const tree = buildTocTree([
      heading("s1", 2, "A"),
      heading("s1.1", 3, "B"),
      heading("s2", 2, "C"),
    ]);
    expect(flattenToc(tree).map((node) => node.blockId)).toEqual(["s1", "s1.1", "s2"]);
  });
});

describe("truncateTitle", () => {
  it("truncates long titles with ellipsis", () => {
    expect(truncateTitle("abcdefghij", 6)).toBe("abcde…");
    expect(truncateTitle("abc", 6)).toBe("abc");
  });
});
