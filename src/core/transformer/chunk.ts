import type { CleanBlock } from "@/core/cleaner";
import type { PaperIR } from "@/core/ir";
import type { CompletedBlock, PromptBlock } from "./prompts";

export const DEFAULT_MAX_CHUNK_CHARS = 4000;

export type TranslationUnit = {
  blockId: string;
  content: string;
  partIndex: number;
  partCount: number;
};

export type TranslationContextBlock = {
  id: string;
  content: string;
};

export type TranslationChunk = {
  units: TranslationUnit[];
  charCount: number;
  contextBlocks: TranslationContextBlock[];
};

const NON_TRANSLATABLE_TYPES = new Set<CleanBlock["type"]>(["math", "codeblock"]);
const SENTENCE_END_PATTERN = /[。．.!?！？]/;

/**
 * 块内需要送翻译的文本。figure 的 content 是整图 HTML（图像不该翻译），
 * 只翻图注 caption；其它块翻 content。
 */
export function translatableContent(block: CleanBlock): string {
  if (block.type === "figure") return block.caption ?? "";
  return block.content;
}

export function isTranslatableBlock(block: CleanBlock): boolean {
  if (NON_TRANSLATABLE_TYPES.has(block.type)) return false;
  if (block.type === "figure") return translatableContent(block).trim().length > 0;
  return true;
}

export function unitPromptId(unit: TranslationUnit): string {
  return unit.partCount === 1 ? unit.blockId : `${unit.blockId}__part${unit.partIndex}`;
}

function endsWithSentenceBoundary(content: string): boolean {
  return /[。．.!?！？]["'”’)\]]*\s*$/.test(content.trimEnd());
}

function findLastSentenceBreakIndex(content: string, maxExclusive: number): number {
  let best = -1;
  const limit = Math.min(maxExclusive, content.length);
  for (let index = 0; index < limit; index += 1) {
    if (SENTENCE_END_PATTERN.test(content[index] ?? "")) {
      best = index + 1;
    }
  }
  return best;
}

export function splitContentAtNaturalBreaks(
  content: string,
  maxChars: number,
): string[] {
  if (content.length <= maxChars) {
    return [content];
  }

  const parts: string[] = [];
  let start = 0;

  while (start < content.length) {
    const remaining = content.length - start;
    if (remaining <= maxChars) {
      parts.push(content.slice(start));
      break;
    }

    const windowEnd = start + maxChars;
    const sentenceBreak = findLastSentenceBreakIndex(content, windowEnd);
    const breakAt =
      sentenceBreak > start ? sentenceBreak : Math.min(windowEnd, content.length);

    parts.push(content.slice(start, breakAt));
    start = breakAt;
  }

  return parts.filter((part) => part.length > 0);
}

function buildUnitsForBlock(block: CleanBlock, maxChars: number): TranslationUnit[] {
  const parts = splitContentAtNaturalBreaks(translatableContent(block), maxChars);
  return parts.map((content, partIndex) => ({
    blockId: block.id,
    content,
    partIndex,
    partCount: parts.length,
  }));
}

function buildContextBlocks(
  contextSource: CleanBlock[],
  firstBlockIndex: number,
): TranslationContextBlock[] {
  const start = Math.max(0, firstBlockIndex - 2);
  return contextSource.slice(start, firstBlockIndex).map((block) => ({
    id: block.id,
    content: translatableContent(block),
  }));
}

function firstBlockIndexForUnits(
  contextSource: CleanBlock[],
  units: TranslationUnit[],
): number {
  const firstBlockId = units[0]?.blockId;
  if (!firstBlockId) {
    return 0;
  }
  return Math.max(
    0,
    contextSource.findIndex((block) => block.id === firstBlockId),
  );
}

function flushChunk(
  chunks: TranslationChunk[],
  contextSource: CleanBlock[],
  units: TranslationUnit[],
  charCount: number,
): void {
  if (units.length === 0) {
    return;
  }

  chunks.push({
    units,
    charCount,
    contextBlocks: buildContextBlocks(
      contextSource,
      firstBlockIndexForUnits(contextSource, units),
    ),
  });
}

/**
 * 按原文顺序将可翻译 block 分批，单批字符总量不超过 maxChars。
 * 优先在 section 起点（heading 且当前批已含正文）、段落边界或句号等自然断点切批；
 * 超长段落按句号拆分。标题始终与其后续正文同批，不会单独成批。
 */
export function chunkBlocksForTranslation(
  blocks: CleanBlock[],
  maxChars: number = DEFAULT_MAX_CHUNK_CHARS,
  precedingBlocks: CleanBlock[] = [],
): TranslationChunk[] {
  const translatable = blocks.filter(isTranslatableBlock);
  const contextSource = [
    ...precedingBlocks.filter(isTranslatableBlock),
    ...translatable,
  ];
  const chunks: TranslationChunk[] = [];
  let currentUnits: TranslationUnit[] = [];
  let currentChars = 0;
  let currentHasBody = false;

  const flush = () => {
    flushChunk(chunks, contextSource, currentUnits, currentChars);
    currentUnits = [];
    currentChars = 0;
    currentHasBody = false;
  };

  for (let blockIndex = 0; blockIndex < translatable.length; blockIndex += 1) {
    const block = translatable[blockIndex]!;

    // 仅当当前批已含正文时，heading 才作为下一 section 的起点切批；否则让标题
    // （及连续的多级标题）与后续正文留在同一批，避免切出仅含标题的小批而多花一次 LLM call。
    if (block.type === "heading" && currentHasBody) {
      flush();
    }

    const units = buildUnitsForBlock(block, maxChars);

    for (const unit of units) {
      const unitChars = unit.content.length;
      const wouldOverflow =
        currentUnits.length > 0 && currentChars + unitChars > maxChars;

      if (wouldOverflow) {
        flush();
      }

      currentUnits.push(unit);
      currentChars += unitChars;
    }

    if (block.type !== "heading") {
      currentHasBody = true;
    }

    if (
      block.type !== "heading" &&
      endsWithSentenceBoundary(translatableContent(block)) &&
      currentChars >= maxChars * 0.75
    ) {
      flush();
    }
  }

  // 文末残留若只有标题（无后续正文可合批），并入上一批而非独立成批。
  if (currentUnits.length > 0 && !currentHasBody && chunks.length > 0) {
    const last = chunks[chunks.length - 1]!;
    last.units.push(...currentUnits);
    last.charCount += currentChars;
    currentUnits = [];
    currentChars = 0;
  } else {
    flush();
  }

  return chunks;
}

export function chunkAbstractBlocksForTranslation(
  abstractBlocks: CleanBlock[],
): TranslationChunk[] {
  const blocks = abstractBlocks.filter(isTranslatableBlock);
  if (blocks.length === 0) {
    return [];
  }

  const units = blocks.flatMap((block) =>
    buildUnitsForBlock(block, Number.MAX_SAFE_INTEGER),
  );

  return [
    {
      units,
      charCount: blocks.reduce((sum, block) => sum + block.content.length, 0),
      contextBlocks: [],
    },
  ];
}

export function chunkPaperBlocksForTranslation(
  abstractBlocks: CleanBlock[],
  bodyBlocks: CleanBlock[],
): TranslationChunk[] {
  return [
    ...chunkAbstractBlocksForTranslation(abstractBlocks),
    ...chunkBlocksForTranslation(bodyBlocks, DEFAULT_MAX_CHUNK_CHARS, abstractBlocks),
  ];
}

export type FullTranslationPayload = {
  units: TranslationUnit[];
  promptBlocks: PromptBlock[];
};

export type ResumeTranslationPayload = {
  units: TranslationUnit[];
  promptBlocks: PromptBlock[];
  completedBlocks: CompletedBlock[];
};

/**
 * Collects all translatable blocks in document order into a single payload
 * for a fresh single-request translation. Very long paragraphs are still
 * split into multi-part units, but all units go into one LLM call.
 */
export function buildFullTranslationPayload(
  abstractBlocks: CleanBlock[],
  bodyBlocks: CleanBlock[],
): FullTranslationPayload {
  const allBlocks = [
    ...abstractBlocks.filter(isTranslatableBlock),
    ...bodyBlocks.filter(isTranslatableBlock),
  ];
  const units = allBlocks.flatMap((block) =>
    buildUnitsForBlock(block, DEFAULT_MAX_CHUNK_CHARS),
  );
  const promptBlocks = units.map((unit) => ({
    id: unitPromptId(unit),
    content: unit.content,
  }));
  return { units, promptBlocks };
}

/**
 * Splits an IR with partially completed translations into a payload for
 * resume translation. Already-translated blocks go into `completedBlocks`
 * (for LLM context) and pending blocks go into `promptBlocks`.
 */
export function buildResumeTranslationPayload(ir: PaperIR): ResumeTranslationPayload {
  const allBlocks = [...ir.abstractBlocks, ...ir.blocks];
  const completedBlocks: CompletedBlock[] = [];
  const pendingUnits: TranslationUnit[] = [];

  for (const block of allBlocks) {
    if (!isTranslatableBlock(block as CleanBlock)) continue;

    const isComplete =
      Boolean(block.translation?.trim()) && block.meta?.translationMissing !== true;

    if (isComplete) {
      completedBlocks.push({
        id: block.id,
        source: translatableContent(block as CleanBlock),
        translation: block.translation!,
      });
    } else {
      pendingUnits.push(...buildUnitsForBlock(block as CleanBlock, DEFAULT_MAX_CHUNK_CHARS));
    }
  }

  const promptBlocks = pendingUnits.map((unit) => ({
    id: unitPromptId(unit),
    content: unit.content,
  }));

  return { units: pendingUnits, promptBlocks, completedBlocks };
}
