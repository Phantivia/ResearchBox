import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { makePaperId, selectionToAnchor, type TextAnchor } from "@/core/annotation";
import type { PaperIR } from "@/core/ir";
import { useAnnotationStore, useReaderTocStore } from "@/store";
import { AnnotationSidebar } from "./AnnotationSidebar";
import {
  applyAnnotationHighlights,
  clearAnnotationHighlights,
  scrollToAnnotation,
} from "./highlights";
import { SelectionToolbar } from "./SelectionToolbar";

export interface AnnotationLayerProps {
  paper: PaperIR;
  projectId: string;
  children: ReactNode;
}

type PendingSelection = {
  anchor: TextAnchor;
  range: Range;
};

export function AnnotationLayer({
  paper,
  projectId,
  children,
}: AnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paperId = makePaperId(paper.arxivId, paper.version);
  const {
    annotations,
    loading,
    loadForPaper,
    createHighlight,
    removeAnnotation,
    editNote,
    reset,
  } = useAnnotationStore();
  const annotationPanelWidth = useReaderTocStore((state) => state.annotationPanelWidth);
  const [pending, setPending] = useState<PendingSelection | null>(null);

  useEffect(() => {
    void loadForPaper(projectId, paperId);
    return () => {
      reset();
      clearAnnotationHighlights();
    };
  }, [projectId, paperId, loadForPaper, reset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || loading) {
      return;
    }
    applyAnnotationHighlights(container, annotations);
    return () => {
      clearAnnotationHighlights();
    };
  }, [annotations, loading, paperId]);

  const captureSelection = useCallback(() => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection) {
      setPending(null);
      return;
    }

    const anchor = selectionToAnchor(selection, container);
    if (!anchor || selection.rangeCount === 0) {
      setPending(null);
      return;
    }

    setPending({
      anchor,
      range: selection.getRangeAt(0).cloneRange(),
    });
  }, []);

  const handleHighlight = useCallback(async () => {
    if (!pending) {
      return;
    }
    await createHighlight(projectId, paperId, pending.anchor);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }, [createHighlight, projectId, paperId, pending]);

  const handleAddNote = useCallback(async () => {
    if (!pending) {
      return;
    }
    const note = window.prompt("笔记（Markdown）", "") ?? "";
    if (note.trim()) {
      await createHighlight(projectId, paperId, pending.anchor, note.trim());
    }
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }, [createHighlight, projectId, paperId, pending]);

  const handleJump = useCallback((annotation: Parameters<typeof scrollToAnnotation>[1]) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    scrollToAnnotation(container, annotation);
  }, []);

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px] xl:block">
      <div
        ref={containerRef}
        className="min-w-0"
        onMouseUp={captureSelection}
        data-testid="annotation-content"
      >
        {children}
        {pending && (
          <SelectionToolbar
            anchor={pending.range}
            open
            onHighlight={() => void handleHighlight()}
            onAddNote={() => void handleAddNote()}
            onClose={() => setPending(null)}
          />
        )}
      </div>

      <AnnotationSidebar
        annotations={annotations}
        onJump={handleJump}
        onDelete={(id) => void removeAnnotation(id)}
        onSaveNote={(id, note) => void editNote(id, note)}
        className="rounded-lg lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] xl:fixed xl:right-0 xl:top-0 xl:z-30 xl:h-screen xl:max-h-none xl:rounded-none xl:border-0 xl:border-l xl:border-[var(--rb-border)]"
        style={{ width: annotationPanelWidth }}
      />
    </div>
  );
}
