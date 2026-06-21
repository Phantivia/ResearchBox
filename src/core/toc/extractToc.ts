import type { PaperIR } from "@/core/ir";

/**
 * 目录条目 — 由论文 IR 的 heading block 派生，供阅读器目录刻度尺与跳转使用。
 * id 复用 block.id（DOM 上的 data-block-id 锚点），title 为纯文本标题。
 */
export interface TocEntry {
  id: string;
  title: string;
  level: number;
}

const TAG_RE = /<[^>]*>/g;
const WHITESPACE_RE = /\s+/g;

function toPlainText(html: string): string {
  return html.replace(TAG_RE, " ").replace(WHITESPACE_RE, " ").trim();
}

/**
 * 从论文 IR 抽取目录：仅取 heading block，跳过空标题，level 缺省为 1。
 * 顺序与 blocks 一致，因此与正文 DOM 中的 heading 顺序一致。
 */
export function extractToc(paper: Pick<PaperIR, "blocks">): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const block of paper.blocks) {
    if (block.type !== "heading") {
      continue;
    }
    const title = toPlainText(block.content);
    if (!title) {
      continue;
    }
    entries.push({ id: block.id, title, level: block.level ?? 1 });
  }
  return entries;
}
