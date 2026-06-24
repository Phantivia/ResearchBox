import { makePaperId } from "@/core/annotation";
import type { PaperIR } from "@/core/ir";

export type Candidate = {
  paperId: string;
  blockId: string;
  heading?: string;
  preview: string;
  fetchedAt: number;
};

const PREVIEW_MAX = 120;
const TAG_RE = /<[^>]*>/g;
const WHITESPACE_RE = /\s+/g;

function toPlainText(html: string): string {
  return html.replace(TAG_RE, " ").replace(WHITESPACE_RE, " ").trim();
}

function truncatePreview(text: string): string {
  if (text.length <= PREVIEW_MAX) {
    return text;
  }
  return `${text.slice(0, PREVIEW_MAX - 1)}…`;
}

function blockPreview(content: string, caption?: string): string {
  const parts = [content, caption].filter(Boolean).join(" ");
  return truncatePreview(toPlainText(parts));
}

export function buildBlockCandidates(
  papers: PaperIR[],
  opts: { paperIds?: string[] } = {},
): Candidate[] {
  const filter = opts.paperIds ? new Set(opts.paperIds) : null;
  const candidates: Candidate[] = [];

  for (const paper of papers) {
    const paperId = makePaperId(paper.arxivId, paper.version);
    if (filter && !filter.has(paperId)) {
      continue;
    }

    let currentHeading: string | undefined;
    for (const block of paper.blocks) {
      if (block.type === "heading") {
        const title = toPlainText(block.content);
        if (title) {
          currentHeading = title;
        }
      }

      candidates.push({
        paperId,
        blockId: block.id,
        ...(currentHeading !== undefined ? { heading: currentHeading } : {}),
        preview: blockPreview(block.content, block.caption),
        fetchedAt: paper.createdAt,
      });
    }
  }

  return candidates;
}

export function formatManifest(candidates: Candidate[]): string {
  return candidates
    .map((candidate) => {
      const id = `${candidate.paperId}#${candidate.blockId}`;
      const headingPart = candidate.heading ? ` (${candidate.heading})` : "";
      return `- ${id}${headingPart}: ${candidate.preview}`;
    })
    .join("\n");
}
