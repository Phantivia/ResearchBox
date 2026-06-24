import type { Block, PaperIR } from "@/core/ir";

const TAG_RE = /<[^>]*>/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function stripHtmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(TAG_RE, "");

  return decodeEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function compactBlockContent(block: Block): string {
  if (block.type === "math" && block.math?.tex) {
    const tex = block.math.tex.trim();
    return block.math.display ? `$$${tex}$$` : `$${tex}$`;
  }

  if (block.type === "figure") {
    const caption = block.caption ? stripHtmlToText(block.caption) : "";
    return caption ? `[figure] ${caption}` : "[figure]";
  }

  if (block.type === "codeblock") {
    return block.content.trim();
  }

  return stripHtmlToText(block.content);
}

function formatBlockLine(paperId: string, block: Block): string {
  const marker = `[${paperId}#${block.id}]`;
  const text = compactBlockContent(block);
  if (!text) {
    return marker;
  }
  if (text.includes("\n")) {
    return `${marker}\n${text}`;
  }
  return `${marker} ${text}`;
}

export type CompactPaperTextOptions = {
  paperId: string;
  routeId?: string;
};

export function formatCompactPaperText(
  ir: PaperIR,
  opts: CompactPaperTextOptions,
): string {
  const lines: string[] = [
    `# ${ir.title}`,
    `paperId: ${opts.paperId}`,
  ];

  if (opts.routeId) {
    lines.push(`routeId: ${opts.routeId}`);
  }

  lines.push(
    "",
    "Cite claims as paperId#blockId using the block markers below.",
    "",
    "--- abstract ---",
  );

  for (const block of ir.abstractBlocks) {
    lines.push(formatBlockLine(opts.paperId, block));
  }

  lines.push("", "--- body ---");

  for (const block of ir.blocks) {
    lines.push(formatBlockLine(opts.paperId, block));
  }

  return lines.join("\n").trimEnd();
}
