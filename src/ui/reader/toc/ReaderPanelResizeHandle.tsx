import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "@/i18n";
import { useReaderTocStore } from "@/store";
import { clampAnnotationPanelWidth, MIN_ANNOTATION_PANEL_WIDTH, MAX_ANNOTATION_PANEL_WIDTH } from "@/core/reader";

/**
 * xl 断点：目录刻度尺与标注栏之间的可拖拽分界。
 */
export function ReaderPanelResizeHandle() {
  const { t } = useTranslation();
  const annotationPanelWidth = useReaderTocStore((state) => state.annotationPanelWidth);
  const setAnnotationPanelWidth = useReaderTocStore(
    (state) => state.setAnnotationPanelWidth,
  );
  const draggingRef = useRef(false);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // pointer 可能已释放，忽略。
    }
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    setAnnotationPanelWidth(clampAnnotationPanelWidth(window.innerWidth - event.clientX));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("toc.resizePanels")}
      aria-valuemin={MIN_ANNOTATION_PANEL_WIDTH}
      aria-valuemax={MAX_ANNOTATION_PANEL_WIDTH}
      aria-valuenow={annotationPanelWidth}
      className="fixed top-0 z-40 hidden cursor-col-resize touch-none xl:block"
      style={{
        right: annotationPanelWidth - 3,
        width: 6,
        height: "100vh",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--rb-border)]" />
    </div>
  );
}
