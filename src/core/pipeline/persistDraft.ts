import type { PaperIR } from "@/core/ir";
import { applyTranslationToIr, type TransformProgress } from "@/core/transformer";
import { savePaper } from "@/db";

export async function persistTranslationProgress(
  draftIr: PaperIR | null,
  event: TransformProgress,
): Promise<PaperIR | null> {
  if (event.type === "structure") {
    const next = structuredClone(event.ir);
    await savePaper(next);
    return next;
  }

  if (event.type === "block-translated" && !event.partial && draftIr) {
    applyTranslationToIr(draftIr, event.blockId, event.translation);
    await savePaper(draftIr);
    return draftIr;
  }

  if (event.type === "done" || event.type === "degraded") {
    await savePaper(event.ir);
    return event.ir;
  }

  return draftIr;
}
