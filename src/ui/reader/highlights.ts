import { anchorToRange } from "@/core/annotation";
import type { Annotation } from "@/core/annotation";

const HIGHLIGHT_NAME = "researchbox-annotation";

export function supportsCustomHighlight(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

export function clearAnnotationHighlights(): void {
  if (!supportsCustomHighlight()) {
    return;
  }
  CSS.highlights.delete(HIGHLIGHT_NAME);
}

export function applyAnnotationHighlights(
  container: HTMLElement,
  annotations: Annotation[],
): void {
  clearAnnotationHighlights();
  removeMarkFallback(container);

  const ranges: Range[] = [];
  for (const annotation of annotations) {
    const range = anchorToRange(
      {
        blockId: annotation.blockId,
        startOffset: annotation.startOffset,
        endOffset: annotation.endOffset,
        quote: annotation.quote,
      },
      container,
    );
    if (range) {
      ranges.push(range);
    }
  }

  if (ranges.length === 0) {
    return;
  }

  if (supportsCustomHighlight()) {
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    return;
  }

  // TODO(fallback): full mark-based path should survive React re-renders via a
  // dedicated overlay or post-render pass; current minimal wrap is best-effort only.
  applyMarkFallback(annotations, ranges);
}

function applyMarkFallback(
  annotations: Annotation[],
  ranges: Range[],
): void {
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const annotation = annotations[index];
    if (!range || !annotation?.id) {
      continue;
    }

    try {
      const mark = document.createElement("mark");
      mark.dataset.annotationId = String(annotation.id);
      mark.className = "bg-yellow-200";
      range.surroundContents(mark);
    } catch {
      // surroundContents fails when range crosses element boundaries we cannot wrap.
    }
  }
}

function removeMarkFallback(container: HTMLElement): void {
  container.querySelectorAll("mark[data-annotation-id]").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  });
}

export function scrollToAnnotation(
  container: HTMLElement,
  annotation: Annotation,
): boolean {
  const range = anchorToRange(
    {
      blockId: annotation.blockId,
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
      quote: annotation.quote,
    },
    container,
  );
  if (!range) {
    return false;
  }

  const element =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;

  element?.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

export { HIGHLIGHT_NAME };
