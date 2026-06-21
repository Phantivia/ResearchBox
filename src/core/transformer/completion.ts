import type { Block, PaperIR } from "@/core/ir";
import { PaperIRSchema } from "@/core/ir";
import type { CleanBlock } from "@/core/cleaner";
import { TRANSLATION_DEBUG_META_KEY } from "./debugMetrics";
import { isTranslatableBlock, translatableContent } from "./chunk";

export function hasCompleteTranslation(block: Block): boolean {
  return Boolean(block.translation?.trim()) && block.meta?.translationMissing !== true;
}

export function isPaperTranslationComplete(ir: PaperIR): boolean {
  const translatable = [...ir.abstractBlocks, ...ir.blocks].filter((block) =>
    isTranslatableBlock(block as CleanBlock),
  );

  if (translatable.length === 0) {
    return true;
  }

  return translatable.every(hasCompleteTranslation);
}

export function countTranslatableBlocks(ir: PaperIR): number {
  return [...ir.abstractBlocks, ...ir.blocks].filter((block) =>
    isTranslatableBlock(block as CleanBlock),
  ).length;
}

export function countTranslatableChars(ir: PaperIR): number {
  return [...ir.abstractBlocks, ...ir.blocks]
    .filter((block) => isTranslatableBlock(block as CleanBlock))
    .reduce((sum, block) => sum + translatableContent(block as CleanBlock).length, 0);
}

export function countCompletedTranslations(ir: PaperIR): number {
  return [...ir.abstractBlocks, ...ir.blocks].filter(
    (block) =>
      isTranslatableBlock(block as CleanBlock) && hasCompleteTranslation(block),
  ).length;
}

export function countCompletedTranslationChars(ir: PaperIR): number {
  return [...ir.abstractBlocks, ...ir.blocks]
    .filter(
      (block) =>
        isTranslatableBlock(block as CleanBlock) &&
        hasCompleteTranslation(block),
    )
    .reduce((sum, block) => sum + translatableContent(block as CleanBlock).length, 0);
}

function stripBlockTranslation(block: Block): Block {
  const next: Block = { ...block, translation: undefined };
  if (!next.meta) {
    return next;
  }

  const meta = { ...next.meta } as Record<string, unknown>;
  delete meta.translationMissing;
  delete meta[TRANSLATION_DEBUG_META_KEY];
  next.meta = Object.keys(meta).length > 0 ? meta : undefined;
  return next;
}

export function stripTranslationsFromIr(ir: PaperIR): PaperIR {
  return PaperIRSchema.parse({
    ...ir,
    abstractBlocks: ir.abstractBlocks.map(stripBlockTranslation),
    blocks: ir.blocks.map(stripBlockTranslation),
  });
}
