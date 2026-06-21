import type { PaperIR } from "@/core/ir";
import { isPaperTranslationComplete } from "@/core/transformer";
import type { Paper, PaperStatus } from "./schema";

export function resolvePaperEntryStatus(ir: PaperIR): PaperStatus {
  if (isPaperTranslationComplete(ir)) {
    return "done";
  }
  if (ir.modelUsed !== "none") {
    return "processing";
  }
  return "ready";
}

export function shouldShowPaperStatusBadge(
  paper: Pick<Paper, "status" | "modelUsed">,
  translationRunning: boolean,
): boolean {
  if (paper.status === "ready") {
    return false;
  }
  if (paper.status === "done" || paper.status === "error") {
    return true;
  }
  return translationRunning || Boolean(paper.modelUsed && paper.modelUsed !== "none");
}
