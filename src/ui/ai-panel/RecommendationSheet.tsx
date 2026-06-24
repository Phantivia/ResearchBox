import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { RecommendationPaperItem } from "./RecommendationPaperItem";

export interface RecommendationSheetProps {
  projectId: string;
}

const SWIPE_THRESHOLD = 40;
const POINTER_SLOP = 10;

type SheetDragState = {
  pointerId: number;
  startY: number;
  moved: boolean;
};

export function RecommendationSheet({ projectId }: RecommendationSheetProps) {
  const { t } = useTranslation();
  const session = useAgentStore((state) => state.recommendationSession);
  const setRecommendationDecision = useAgentStore((state) => state.setRecommendationDecision);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const sheetExpandedRef = useRef(sheetExpanded);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<SheetDragState | null>(null);
  const bodyDragCleanupRef = useRef<(() => void) | null>(null);

  sheetExpandedRef.current = sheetExpanded;

  const isOpen = session !== null;
  const sessionId = session?.toolUseId ?? null;

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      const timer = window.setTimeout(() => setMounted(false), 240);
      return () => window.clearTimeout(timer);
    }

    setMounted(true);
    setSheetExpanded(true);
    requestAnimationFrame(() => setVisible(true));
  }, [isOpen, sessionId]);

  useEffect(() => {
    return () => {
      bodyDragCleanupRef.current?.();
      bodyDragCleanupRef.current = null;
    };
  }, []);

  const expandSheet = useCallback(() => {
    setSheetExpanded(true);
  }, []);

  const collapseSheet = useCallback(() => {
    setSheetExpanded(false);
  }, []);

  const isPaperInteraction = useCallback((target: EventTarget | null) => {
    return target instanceof Element && Boolean(target.closest("[data-recommendation-paper]"));
  }, []);

  const canCollapseFromSwipe = useCallback(() => {
    return !bodyRef.current || bodyRef.current.scrollTop <= 0;
  }, []);

  const finishCapturedGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const dy = event.clientY - drag.startY;
      dragRef.current = null;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // pointer 可能已释放，忽略。
      }

      const expanded = sheetExpandedRef.current;

      if (Math.abs(dy) >= SWIPE_THRESHOLD) {
        if (dy > 0 && expanded && canCollapseFromSwipe()) {
          collapseSheet();
          return;
        }
        if (dy < 0 && !expanded) {
          expandSheet();
          return;
        }
      }

      if (drag.moved || isPaperInteraction(event.target)) {
        return;
      }

      if (expanded) {
        collapseSheet();
      } else {
        expandSheet();
      }
    },
    [canCollapseFromSwipe, collapseSheet, expandSheet, isPaperInteraction],
  );

  const handleCapturedPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleCapturedPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (Math.abs(event.clientY - drag.startY) > POINTER_SLOP) {
      drag.moved = true;
    }
  }, []);

  const handleCapturedPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  const handleBodyPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !sheetExpandedRef.current || isPaperInteraction(event.target)) {
        return;
      }

      bodyDragCleanupRef.current?.();

      const startY = event.clientY;
      let moved = false;

      const finishBodyGesture = (ev: PointerEvent) => {
        bodyDragCleanupRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finishBodyGesture);
        window.removeEventListener("pointercancel", finishBodyGesture);

        const dy = ev.clientY - startY;

        if (Math.abs(dy) >= SWIPE_THRESHOLD && dy > 0 && canCollapseFromSwipe()) {
          collapseSheet();
          return;
        }

        if (!moved && !isPaperInteraction(ev.target)) {
          collapseSheet();
        }
      };

      const onMove = (ev: PointerEvent) => {
        if (Math.abs(ev.clientY - startY) > POINTER_SLOP) {
          moved = true;
        }
      };

      bodyDragCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finishBodyGesture);
        window.removeEventListener("pointercancel", finishBodyGesture);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finishBodyGesture);
      window.addEventListener("pointercancel", finishBodyGesture);
    },
    [canCollapseFromSwipe, collapseSheet, isPaperInteraction],
  );

  if (!mounted || !session) {
    return null;
  }

  const pendingCount = session.papers.filter(
    (paper) => session.decisions[paper.arxivId] === undefined,
  ).length;

  const capturedPointerProps = {
    onPointerDown: handleCapturedPointerDown,
    onPointerMove: handleCapturedPointerMove,
    onPointerUp: finishCapturedGesture,
    onPointerCancel: handleCapturedPointerCancel,
  };

  return (
    <div
      id="recommendation-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="recommendation-sheet-title"
      aria-expanded={sheetExpanded}
      {...(sheetExpanded ? {} : capturedPointerProps)}
      className={[
        "absolute bottom-full left-0 right-0 z-30 overflow-hidden rounded-t-2xl border border-b-0 border-[var(--rb-border)] bg-[var(--rb-card-bg)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-all duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden",
        sheetExpanded ? "max-h-[min(52dvh,24rem)]" : "max-h-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        !sheetExpanded ? "cursor-pointer touch-pan-y" : "",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-col",
          sheetExpanded ? "max-h-[min(52dvh,24rem)]" : "max-h-none",
        ].join(" ")}
      >
        <div
          data-sheet-chrome
          {...(sheetExpanded ? capturedPointerProps : {})}
          className={[
            "flex w-full shrink-0 flex-col items-center text-left transition-colors",
            sheetExpanded
              ? "border-b border-[var(--rb-border)] pt-2 pb-2.5"
              : "py-2 active:bg-[color-mix(in_srgb,var(--rb-border)_16%,var(--rb-card-bg))]",
          ].join(" ")}
        >
          <span
            aria-hidden
            className={[
              "h-1 w-10 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--rb-text-secondary)_35%,var(--rb-border))]",
              sheetExpanded ? "mb-2" : "mb-1.5",
            ].join(" ")}
          />
          <span className="flex w-full items-center gap-2 px-4">
            {!sheetExpanded ? <SheetExpandIcon /> : null}
            <span className="min-w-0 flex-1">
              {sheetExpanded ? (
                <>
                  <span
                    id="recommendation-sheet-title"
                    className="block truncate text-sm font-semibold text-[var(--rb-text-primary)]"
                  >
                    {t("agent.recommend.panelTitle", { count: session.papers.length })}
                  </span>
                  {pendingCount > 0 ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--rb-text-secondary)]">
                      {t("agent.recommend.panelPending", { count: pendingCount })}
                    </span>
                  ) : null}
                </>
              ) : (
                <span
                  id="recommendation-sheet-title"
                  className="block truncate text-sm font-medium text-[var(--rb-text-primary)]"
                >
                  {pendingCount > 0
                    ? t("agent.recommend.sheetPeek", { count: pendingCount })
                    : t("agent.recommend.sheetPeekNone")}
                </span>
              )}
            </span>
            <SheetChevron expanded={sheetExpanded} />
          </span>
        </div>

        {sheetExpanded ? (
          <div
            id="recommendation-sheet-body"
            ref={bodyRef}
            onPointerDown={handleBodyPointerDown}
            className="min-h-0 flex-1 touch-pan-y space-y-1.5 overflow-y-auto px-3 py-2"
          >
            {session.papers.map((paper) => (
              <RecommendationPaperItem
                key={paper.arxivId}
                projectId={projectId}
                recommendation={paper}
                decision={session.decisions[paper.arxivId]}
                compact
                onDecisionChange={async (arxivId, decision) => {
                  setRecommendationDecision(arxivId, decision);
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SheetExpandIcon() {
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--rb-primary)_12%,var(--rb-card-bg))] text-[var(--rb-primary)]"
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m18 15-6-6-6 6" />
      </svg>
    </span>
  );
}

function SheetChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={[
        "shrink-0 text-[var(--rb-text-secondary)] transition-transform duration-240 ease-[cubic-bezier(0.32,0.72,0,1)]",
        expanded ? "rotate-180" : "rotate-0",
      ].join(" ")}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
