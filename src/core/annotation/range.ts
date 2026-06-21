import type { TextAnchor } from "./schema";

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function blockPlainText(block: Element): string {
  return (block.textContent ?? "").replace(/\u00a0/g, " ");
}

function findBlockAncestor(node: Node, root: Node): Element | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      const blockId = element.getAttribute("data-block-id");
      if (blockId) {
        return element;
      }
    }
    current = current.parentNode;
  }
  return null;
}

function offsetWithinBlock(block: Element, container: Node, offset: number): number | null {
  try {
    const probe = block.ownerDocument.createRange();
    probe.selectNodeContents(block);
    probe.setEnd(container, offset);
    return blockPlainTextFromRange(probe);
  } catch {
    return null;
  }
}

function blockPlainTextFromRange(range: Range): number {
  return (range.toString() ?? "").replace(/\u00a0/g, " ").length;
}

function locateBoundary(
  block: Element,
  targetOffset: number,
): { node: Node; offset: number } | null {
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = targetOffset;

  let textNode = walker.nextNode();
  while (textNode) {
    const content = textNode.textContent ?? "";
    const length = content.replace(/\u00a0/g, " ").length;

    if (remaining <= length) {
      return { node: textNode, offset: remaining };
    }

    remaining -= length;
    textNode = walker.nextNode();
  }

  if (targetOffset === blockPlainText(block).length && block.lastChild) {
    const endContainer = block;
    return { node: endContainer, offset: endContainer.childNodes.length };
  }

  return null;
}

export function selectionToAnchor(
  selection: Selection,
  root: Node = selection.anchorNode?.ownerDocument?.body ?? document.body,
): TextAnchor | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return null;
  }

  const startBlock = findBlockAncestor(range.startContainer, root);
  const endBlock = findBlockAncestor(range.endContainer, root);

  if (!startBlock || !endBlock || startBlock !== endBlock) {
    return null;
  }

  const blockId = startBlock.getAttribute("data-block-id");
  if (!blockId) {
    return null;
  }

  const startOffset = offsetWithinBlock(
    startBlock,
    range.startContainer,
    range.startOffset,
  );
  const endOffset = offsetWithinBlock(
    startBlock,
    range.endContainer,
    range.endOffset,
  );

  if (startOffset === null || endOffset === null || startOffset >= endOffset) {
    return null;
  }

  const plain = blockPlainText(startBlock);
  const rawQuote = plain.slice(startOffset, endOffset);
  const quote = normalizeWhitespace(rawQuote);
  if (!quote) {
    return null;
  }

  return { blockId, startOffset, endOffset, quote };
}

export function anchorToRange(
  anchor: TextAnchor,
  container: Element,
): Range | null {
  const block = container.querySelector(
    `[data-block-id="${CSS.escape(anchor.blockId)}"]`,
  );
  if (!block) {
    return null;
  }

  const start = locateBoundary(block, anchor.startOffset);
  const end = locateBoundary(block, anchor.endOffset);
  if (!start || !end) {
    return null;
  }

  try {
    const range = container.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (range.collapsed) {
      return null;
    }
    return range;
  } catch {
    return null;
  }
}
