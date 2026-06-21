import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { makePaperId, selectionToAnchor, type TextAnchor } from "@/core/annotation";
import type { PaperIR } from "@/core/ir";
import { buildTocTree, flattenToc } from "@/core/reader/toc";
import { useAnnotationStore } from "@/store";
import { AnnotationSidebar } from "./AnnotationSidebar";
import {
  applyAnnotationHighlights,
  clearAnnotationHighlights,
  scrollToAnnotation,
  scrollToBlock,
} from "./highlights";
import { MobileSectionNav, useActiveSection } from "./MobileSectionNav";
import { SelectionToolbar } from "./SelectionToolbar";
import { TableOfContents } from "./TableOfContents";

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

  const tocBlockIds = flattenToc(buildTocTree(paper.blocks)).map((node) => node.blockId);
  const activeSectionId = useActiveSection(containerRef, tocBlockIds);

  const handleBlockJump = useCallback((blockId: string) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    scrollToBlock(container, blockId);
  }, []);

  return (
    <div className="min-w-0">
      <MobileSectionNav
        blocks={paper.blocks}
        containerRef={containerRef}
        onJump={handleBlockJump}
      />
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
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

      <aside className="hidden min-w-0 space-y-4 lg:block">
        <TableOfContents
          blocks={paper.blocks}
          activeBlockId={activeSectionId}
          onJump={handleBlockJump}
        />
        <AnnotationSidebar
          annotations={annotations}
          onJump={handleJump}
          onDelete={(id) => void removeAnnotation(id)}
          onSaveNote={(id, note) => void editNote(id, note)}
        />
      </aside>
    </div>
    </div>
  );
}
