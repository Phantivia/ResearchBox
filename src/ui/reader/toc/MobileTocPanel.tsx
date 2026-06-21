import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { useReaderTocStore } from "@/store";
import { useVisualViewportBox } from "@/ui/shell/useVisualViewportBox";
import {
  collectHeadingTops,
  MOBILE_TOC_ACTIVE_LINE_RATIO,
  scrollToHeadingAtLineRatio,
  scrollToHeadingIndex,
} from "./scrollToHeading";
import {
  mobileTocCardVisual,
  mobileTocCenterOffsetCss,
  mobileTocPanelOpacity,
  mobileTocPanelScale,
  MOBILE_TOC_CENTER_RATIO,
} from "./mobileTocVisual";
import {
  MOBILE_TOC_ITEM_MIN_HEIGHT,
  mobileTocFloatFromScrollTop,
  mobileTocHeights,
  mobileTocScrollTopForIndex,
} from "./mobileTocLayout";
import { TocTick } from "./TocTick";
const PANEL_MS = 240;
const SETTLE_MS = 120;
const SECTION_COLUMN_WIDTH = "min(320px, 82vw)";

const BACKDROP_IDLE = "rgba(0,0,0,0.30)";
const BACKDROP_INTERACT = "rgba(0,0,0,0.15)";

function nearestCenterIndex(centerFloat: number, count: number): number {
  let best = 0;
  let minDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    const dist = Math.abs(i - centerFloat);
    if (dist < minDist) {
      minDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * 移动端 / 平板的右侧 section 目录。
 * section 块贴屏幕右缘；点击非 section 区域收起。拖拽时正文按 section 离散跳转（不插值平滑滚动）。
 */
export function MobileTocPanel() {
  const { t } = useTranslation();
  const entries = useReaderTocStore((state) => state.entries);
  const activeId = useReaderTocStore((state) => state.activeId);
  const open = useReaderTocStore((state) => state.mobileOpen);
  const setMobileOpen = useReaderTocStore((state) => state.setMobileOpen);
  const setActiveId = useReaderTocStore((state) => state.setActiveId);
  const viewport = useVisualViewportBox();
  const itemHeights = useMemo(() => mobileTocHeights(entries), [entries]);
  const heightsRef = useRef(itemHeights);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [centerFloat, setCenterFloat] = useState(0);
  const [centeredIndex, setCenteredIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const topsRef = useRef<number[]>([]);
  const settleTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const scrollRaf = useRef(0);
  const centerFloatRef = useRef(0);
  const suppressScroll = useRef(false);
  const lastIndex = useRef(0);
  const interactingRef = useRef(false);
  const entriesRef = useRef(entries);

  const clearSettleTimer = () => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  };

  const cancelScrollRaf = () => {
    if (scrollRaf.current !== 0) {
      window.cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = 0;
    }
  };

  const applyCardVisuals = useCallback((floatIndex: number, count: number) => {
    const centered = nearestCenterIndex(floatIndex, count);
    for (let index = 0; index < count; index += 1) {
      const card = cardRefs.current[index];
      if (!card) {
        continue;
      }
      const { opacity, scale, zIndex } = mobileTocCardVisual(
        index - floatIndex,
        index === centered,
      );
      card.style.opacity = String(opacity);
      card.style.transform = `scale(${scale})`;
      card.style.zIndex = String(zIndex);
    }
    const overlay = overlayRef.current;
    if (overlay) {
      const height =
        heightsRef.current[centered] ?? MOBILE_TOC_ITEM_MIN_HEIGHT;
      overlay.style.height = `${height}px`;
    }
    return centered;
  }, []);

  const clearCardVisuals = useCallback(() => {
    cardRefs.current.forEach((card) => {
      if (!card) {
        return;
      }
      card.style.opacity = "";
      card.style.transform = "";
      card.style.zIndex = "";
    });
    if (overlayRef.current) {
      overlayRef.current.style.height = "";
    }
  }, []);

  const setBackdropInteract = useCallback((active: boolean) => {
    if (interactingRef.current === active) {
      return;
    }
    interactingRef.current = active;
    if (backdropRef.current) {
      backdropRef.current.style.backgroundColor = active
        ? BACKDROP_INTERACT
        : BACKDROP_IDLE;
    }
  }, []);

  const close = useCallback(() => setMobileOpen(false), [setMobileOpen]);

  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      interactingRef.current = false;
      setInteracting(false);
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    if (!mounted) {
      return;
    }

    clearSettleTimer();
    setVisible(false);
    closeTimer.current = window.setTimeout(() => {
      setMounted(false);
      closeTimer.current = null;
    }, PANEL_MS);

    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [open, mounted]);

  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeId),
  );
  const centeredItemHeight = itemHeights[centeredIndex] ?? MOBILE_TOC_ITEM_MIN_HEIGHT;
  const topSpacerHeight = mobileTocCenterOffsetCss(
    itemHeights[0] ?? MOBILE_TOC_ITEM_MIN_HEIGHT,
  );
  const bottomSpacerHeight = mobileTocCenterOffsetCss(
    itemHeights[itemHeights.length - 1] ?? MOBILE_TOC_ITEM_MIN_HEIGHT,
  );

  useEffect(() => {
    heightsRef.current = itemHeights;
  }, [itemHeights]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useLayoutEffect(() => {
    if (!interacting) {
      return;
    }
    applyCardVisuals(centerFloatRef.current, entries.length);
  }, [applyCardVisuals, centeredIndex, entries.length, interacting]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (backdropRef.current) {
      backdropRef.current.style.backgroundColor = BACKDROP_IDLE;
    }
    interactingRef.current = false;
    topsRef.current = collectHeadingTops(entries.map((entry) => entry.id));
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    setCenterFloat(activeIndex);
    setCenteredIndex(activeIndex);
    centerFloatRef.current = activeIndex;
    lastIndex.current = activeIndex;
    suppressScroll.current = true;
    node.scrollTop = mobileTocScrollTopForIndex(activeIndex, itemHeights);
    window.setTimeout(() => {
      suppressScroll.current = false;
    }, 80);
    // 仅在面板打开瞬间执行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    return () => {
      clearSettleTimer();
      cancelScrollRaf();
    };
  }, []);

  const commitCenterIndex = useCallback(
    (index: number) => {
      const currentEntries = entriesRef.current;
      if (index !== lastIndex.current) {
        lastIndex.current = index;
        setCenteredIndex(index);
        const entry = currentEntries[index];
        if (entry) {
          setActiveId(entry.id);
        }
        const tops = topsRef.current;
        if (tops.length > 0) {
          scrollToHeadingIndex(
            index,
            tops,
            MOBILE_TOC_ACTIVE_LINE_RATIO,
            "auto",
          );
        }
      }
    },
    [setActiveId],
  );

  const beginInteraction = useCallback(() => {
    if (!interactingRef.current) {
      setInteracting(true);
    }
    setBackdropInteract(true);
  }, [setBackdropInteract]);

  const endInteraction = useCallback(() => {
    clearCardVisuals();
    setInteracting(false);
    setBackdropInteract(false);
  }, [clearCardVisuals, setBackdropInteract]);

  const syncFromScrollPosition = useCallback(() => {
    const node = scrollRef.current;
    const currentEntries = entriesRef.current;
    if (!node || currentEntries.length === 0 || suppressScroll.current) {
      return;
    }
    if (scrollRaf.current !== 0) {
      return;
    }
    scrollRaf.current = window.requestAnimationFrame(() => {
      scrollRaf.current = 0;
      const scrollNode = scrollRef.current;
      if (!scrollNode || suppressScroll.current) {
        return;
      }
      beginInteraction();
      const floatIndex = mobileTocFloatFromScrollTop(
        scrollNode.scrollTop,
        heightsRef.current,
      );
      centerFloatRef.current = floatIndex;
      applyCardVisuals(floatIndex, currentEntries.length);
      commitCenterIndex(nearestCenterIndex(floatIndex, currentEntries.length));
      clearSettleTimer();
      settleTimer.current = window.setTimeout(() => {
        const settledNode = scrollRef.current;
        const settledEntries = entriesRef.current;
        if (!settledNode) {
          endInteraction();
          settleTimer.current = null;
          return;
        }
        const heights = heightsRef.current;
        const settledIndex = nearestCenterIndex(
          mobileTocFloatFromScrollTop(settledNode.scrollTop, heights),
          settledEntries.length,
        );
        settledNode.scrollTop = mobileTocScrollTopForIndex(settledIndex, heights);
        setCenterFloat(settledIndex);
        setCenteredIndex(settledIndex);
        lastIndex.current = settledIndex;
        const entry = settledEntries[settledIndex];
        if (entry) {
          setActiveId(entry.id);
        }
        const tops = topsRef.current;
        if (tops.length > 0) {
          scrollToHeadingIndex(
            settledIndex,
            tops,
            MOBILE_TOC_ACTIVE_LINE_RATIO,
            "auto",
          );
        }
        endInteraction();
        settleTimer.current = null;
      }, SETTLE_MS);
    });
  }, [
    applyCardVisuals,
    beginInteraction,
    commitCenterIndex,
    endInteraction,
    setActiveId,
  ]);

  const handleScroll = () => {
    syncFromScrollPosition();
  };

  const handleSelect = (id: string, index: number) => {
    clearSettleTimer();
    cancelScrollRaf();
    lastIndex.current = index;
    setCenterFloat(index);
    setCenteredIndex(index);
    setActiveId(id);
    scrollToHeadingAtLineRatio(id, MOBILE_TOC_ACTIVE_LINE_RATIO, "smooth");
    close();
  };

  const handleDismiss = () => {
    clearSettleTimer();
    cancelScrollRaf();
    close();
  };

  const stopSectionClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  if (!mounted || entries.length === 0) {
    return null;
  }

  const panelTransition = `transform ${PANEL_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
  const backdropTransition = `opacity ${PANEL_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;

  return (
    <div
      className="fixed z-40 xl:hidden"
      style={{
        top: viewport.offsetTop,
        left: viewport.offsetLeft,
        width: viewport.width,
        height: viewport.height,
      }}
      role="dialog"
      aria-label={t("toc.title")}
    >
      <div onClick={handleDismiss} className="absolute inset-0">
        <div
          ref={backdropRef}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: BACKDROP_IDLE,
            opacity: visible ? 1 : 0,
            transition: backdropTransition,
          }}
        />
        <div
          className="absolute inset-y-0 right-0 will-change-transform"
          style={{
            width: SECTION_COLUMN_WIDTH,
            transform: visible ? "translateX(0)" : "translateX(100%)",
            transition: panelTransition,
          }}
        >
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              scrollSnapType: "y proximity",
              scrollPaddingTop: topSpacerHeight,
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div style={{ height: topSpacerHeight }} aria-hidden />
            {entries.map((entry, index) => {
              const itemHeight = itemHeights[index] ?? MOBILE_TOC_ITEM_MIN_HEIGHT;
              const isCentered = index === centeredIndex;
              const distance = index - centerFloat;
              const cardOpacity = interacting
                ? undefined
                : mobileTocPanelOpacity(distance, isCentered);
              const scale = interacting
                ? undefined
                : mobileTocPanelScale(distance, isCentered);
              return (
                <div
                  key={entry.id}
                  data-toc-section
                  onClick={stopSectionClick}
                  className="px-3"
                  style={{ height: itemHeight, scrollSnapAlign: "start" }}
                >
                  <div
                    ref={(node) => {
                      cardRefs.current[index] = node;
                    }}
                    className={[
                      "relative flex h-full w-full items-center px-3 shadow-sm",
                      isCentered ? "z-20" : "z-0",
                      interacting ? "" : "transition-transform duration-200 ease-out",
                    ].join(" ")}
                    style={{
                      backgroundColor: "#ffffff",
                      opacity: cardOpacity,
                      transform: scale === undefined ? undefined : `scale(${scale})`,
                      transformOrigin: "right center",
                    }}
                  >
                    <TocTick
                      title={entry.title}
                      level={entry.level}
                      active={isCentered}
                      scale={1}
                      opacity={1}
                      motion={false}
                      variant="panel"
                      onClick={() => handleSelect(entry.id, index)}
                    />
                  </div>
                </div>
              );
            })}
            <div style={{ height: bottomSpacerHeight }} aria-hidden />
          </div>
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 -translate-y-1/2 border-y border-[var(--rb-primary)]/25"
            style={{
              top: `${MOBILE_TOC_CENTER_RATIO * 100}%`,
              height: interacting ? undefined : centeredItemHeight,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * md–xl（无移动端顶栏、又未到 PC 刻度尺断点）区间的悬浮目录开关，贴右侧边沿。
 */
export function TocFloatingButton() {
  const { t } = useTranslation();
  const entries = useReaderTocStore((state) => state.entries);
  const setMobileOpen = useReaderTocStore((state) => state.setMobileOpen);

  if (entries.length === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      aria-label={t("toc.openOutline")}
      className="fixed right-0 top-1/2 z-20 hidden -translate-y-1/2 items-center gap-1 rounded-l-lg border border-r-0 border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-2 py-3 text-[var(--rb-text-secondary)] shadow-md transition-colors hover:text-[var(--rb-primary)] md:flex xl:hidden"
    >
      <ListIcon />
    </button>
  );
}

function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
