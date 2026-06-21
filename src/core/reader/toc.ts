import type { Block } from "@/core/ir";

export interface TocNode {
  blockId: string;
  level: number;
  title: string;
  children: TocNode[];
}

export function stripHeadingHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function extractHeadingBlocks(blocks: Block[]): Block[] {
  return blocks.filter((block) => block.type === "heading");
}

export function buildTocTree(blocks: Block[]): TocNode[] {
  const headings = extractHeadingBlocks(blocks);
  const root: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const heading of headings) {
    const level = heading.level ?? 2;
    const node: TocNode = {
      blockId: heading.id,
      level,
      title: stripHeadingHtml(heading.content),
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1]!.children.push(node);
    }
    stack.push(node);
  }

  return root;
}

export function flattenToc(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = [];

  const walk = (list: TocNode[]) => {
    for (const node of list) {
      result.push(node);
      walk(node.children);
    }
  };

  walk(nodes);
  return result;
}

export function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) {
    return title;
  }
  return `${title.slice(0, maxLength - 1)}…`;
}
