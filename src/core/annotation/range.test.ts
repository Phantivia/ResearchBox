import { describe, expect, it } from "vitest";
import { anchorToRange, selectionToAnchor } from "./range";

function mountBlock(html: string, blockId = "blk-1"): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = `<div data-block-id="${blockId}">${html}</div>`;
  document.body.appendChild(container);
  return container;
}

function selectText(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
): Selection {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function cleanup() {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
}

describe("selectionToAnchor / anchorToRange", () => {
  it("round-trips a simple text selection", () => {
    const container = mountBlock("<p>Hello world.</p>");

    const block = container.querySelector("[data-block-id]")!;
    const textNode = block.querySelector("p")!.firstChild!;
    const selection = selectText(textNode, 0, textNode, 5);

    const anchor = selectionToAnchor(selection, container);
    expect(anchor).toEqual({
      blockId: "blk-1",
      startOffset: 0,
      endOffset: 5,
      quote: "Hello",
    });

    const range = anchorToRange(anchor!, container);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("Hello");

    cleanup();
  });

  it("round-trips a cross-node selection within one block", () => {
    const container = mountBlock(
      "<p>Alpha <strong>bold</strong> omega.</p>",
    );

    const block = container.querySelector("[data-block-id]")!;
    const paragraph = block.querySelector("p")!;
    const startNode = paragraph.firstChild!;
    const endNode = paragraph.querySelector("strong")!.firstChild!;

    const selection = selectText(startNode, 6, endNode, 4);
    const anchor = selectionToAnchor(selection, container);

    expect(anchor).toMatchObject({
      blockId: "blk-1",
      quote: "bold",
    });

    const range = anchorToRange(anchor!, container);
    expect(range?.toString()).toBe("bold");

    cleanup();
  });

  it("normalizes non-breaking spaces in offsets and quote", () => {
    const container = mountBlock("<p>A\u00a0B C</p>");

    const block = container.querySelector("[data-block-id]")!;
    const textNode = block.querySelector("p")!.firstChild!;
    const selection = selectText(textNode, 0, textNode, 3);

    const anchor = selectionToAnchor(selection, container);
    expect(anchor).toEqual({
      blockId: "blk-1",
      startOffset: 0,
      endOffset: 3,
      quote: "A B",
    });

    const range = anchorToRange(anchor!, container);
    expect(range?.toString().replace(/\u00a0/g, " ")).toBe("A B");

    cleanup();
  });

  it("returns null when selection spans multiple blocks", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-block-id="a"><p>Block A</p></div>
      <div data-block-id="b"><p>Block B</p></div>
    `;
    document.body.appendChild(container);

    const blockA = container.querySelector('[data-block-id="a"] p')!.firstChild!;
    const blockB = container.querySelector('[data-block-id="b"] p')!.firstChild!;
    const selection = selectText(blockA, 0, blockB, 6);

    expect(selectionToAnchor(selection, container)).toBeNull();

    cleanup();
  });

  it("returns null for collapsed selection", () => {
    const container = mountBlock("<p>Hello</p>");
    const textNode = container.querySelector("p")!.firstChild!;
    const selection = selectText(textNode, 2, textNode, 2);

    expect(selectionToAnchor(selection, container)).toBeNull();

    cleanup();
  });

  it("anchorToRange returns null for missing block", () => {
    const container = mountBlock("<p>Hello</p>");

    expect(
      anchorToRange(
        {
          blockId: "missing",
          startOffset: 0,
          endOffset: 3,
          quote: "Hel",
        },
        container,
      ),
    ).toBeNull();

    cleanup();
  });

  it("anchorToRange returns null for out-of-range offsets", () => {
    const container = mountBlock("<p>Hi</p>");

    expect(
      anchorToRange(
        {
          blockId: "blk-1",
          startOffset: 0,
          endOffset: 99,
          quote: "Hi",
        },
        container,
      ),
    ).toBeNull();

    cleanup();
  });
});
