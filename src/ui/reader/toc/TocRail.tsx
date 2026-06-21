import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TOC_RAIL_WIDTH } from "@/core/reader";
import { useReaderTocStore } from "@/store";
import {
  collectHeadingTops,
  scrollBodyToHeadingFloat,
  scrollToHeading,
  TOC_ACTIVE_LINE_RATIO,
} from "./scrollToHeading";
import { TocTick } from "./TocTick";

const ITEM_HEIGHT = 38;
const DRAG_THRESHOLD = 4;

// 边缘软淡出交给容器的 mask 渐变；这里保持较高的下限，让远处标题变淡但仍可读。
const EDGE_MASK =
  "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)";

function railScale(distance: number): number {
  return Math.max(0.72, 1 - distance * 0.08);
}

function railOpacity(distance: number): number {
  return Math.max(0.35, 1 - distance * 0.09);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface DragState {
  startY: number;
  startFloat: number;
  tops: number[];
}

/**
 * PC 端固定在右侧（贴着标注栏左边）的目录刻度尺。
 * - 随页面滚动：当前 section 居中放大，远端缩小淡出。
 * - 拖动刻度尺：刻度跟手 1:1 移动，背景正文按 section 间距插值实时滚动。
 * 仅在 xl 及以上显示，正文容器已用 xl:mr 预留了右侧空间。
 */
export function TocRail() {
  const entries = useReaderTocStore((state) => state.entries);
  const activeId = useReaderTocStore((state) => state.activeId);
  const setActiveId = useReaderTocStore((state) => state.setActiveId);
  const annotationPanelWidth = useReaderTocStore((state) => state.annotationPanelWidth);

  const [dragFloat, setDragFloat] = useState<number | null>(null);
  const dragState = useRef<DragState | null>(null);
  const movedRef = useRef(false);

  if (entries.length === 0) {
    return null;
  }

  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeId),
  );
  const center = dragFloat ?? activeIndex;
  const dragging = dragFloat !== null;

  const floatFromScroll = (tops: number[]): number => {
    const line = window.scrollY + window.innerHeight * TOC_ACTIVE_LINE_RATIO;
    const valid = tops.map((top) => (Number.isNaN(top) ? -Infinity : top));
    if (line <= valid[0]!) {
      return 0;
    }
    for (let i = 0; i < valid.length - 1; i += 1) {
      const top = valid[i]!;
      const next = valid[i + 1]!;
      if (line < next) {
        const span = next - top;
        return span > 0 ? i + (line - top) / span : i;
      }
    }
    return valid.length - 1;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const tops = collectHeadingTops(entries.map((entry) => entry.id));
    dragState.current = {
      startY: event.clientY,
      startFloat: floatFromScroll(tops),
      tops,
    };
    movedRef.current = false;
    setDragFloat(dragState.current.startFloat);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state) {
      return;
    }
    const dy = event.clientY - state.startY;
    if (Math.abs(dy) > DRAG_THRESHOLD) {
      movedRef.current = true;
    }
    const next = clamp(state.startFloat - dy / ITEM_HEIGHT, 0, entries.length - 1);
    setDragFloat(next);
    scrollBodyToHeadingFloat(next, state.tops, "auto");
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current) {
      return;
    }
    dragState.current = null;
    setDragFloat(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // pointer 可能已释放，忽略。
    }
  };

  return (
    <nav
      aria-label="Outline"
      className="pointer-events-none fixed top-0 z-20 hidden h-screen overflow-hidden xl:block"
      style={{
        right: annotationPanelWidth,
        width: TOC_RAIL_WIDTH,
        maskImage: EDGE_MASK,
        WebkitMaskImage: EDGE_MASK,
      }}
    >
      <div className="absolute inset-y-0 left-4 w-px bg-[var(--rb-border)]/70" aria-hidden />
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(event) => {
          if (movedRef.current) {
            event.stopPropagation();
            event.preventDefault();
            movedRef.current = false;
          }
        }}
        className={[
          "pointer-events-auto absolute inset-x-0 top-1/2 flex touch-none flex-col pl-4 will-change-transform",
          dragging ? "cursor-grabbing select-none" : "cursor-grab",
        ].join(" ")}
        style={{
          transform: `translateY(-${(center + 0.5) * ITEM_HEIGHT}px)`,
          transition: dragging
            ? "none"
            : "transform 500ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {entries.map((entry, index) => {
          const distance = Math.abs(index - center);
          return (
            <div
              key={entry.id}
              className="flex shrink-0 items-center pr-2"
              style={{ height: ITEM_HEIGHT }}
            >
              <TocTick
                title={entry.title}
                level={entry.level}
                active={Math.round(center) === index}
                scale={railScale(distance)}
                opacity={railOpacity(distance)}
                variant="rail"
                onClick={() => {
                  setActiveId(entry.id);
                  scrollToHeading(entry.id);
                }}
              />
            </div>
          );
        })}
      </div>
    </nav>
  );
}
