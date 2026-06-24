import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { RecommendationPaperItem } from "./RecommendationPaperItem";

export interface RecommendationSheetProps {
  projectId: string;
}

export function RecommendationSheet({ projectId }: RecommendationSheetProps) {
  const { t } = useTranslation();
  const session = useAgentStore((state) => state.recommendationSession);
  const setRecommendationDecision = useAgentStore((state) => state.setRecommendationDecision);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true);

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

  if (!mounted || !session) {
    return null;
  }

  const pendingCount = session.papers.filter(
    (paper) => session.decisions[paper.arxivId] === undefined,
  ).length;

  return (
    <div
      id="recommendation-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="recommendation-sheet-title"
      className={[
        "absolute bottom-full left-0 right-0 z-30 overflow-hidden rounded-t-2xl border border-b-0 border-[var(--rb-border)] bg-[var(--rb-card-bg)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-all duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden",
        sheetExpanded ? "max-h-[min(52dvh,24rem)]" : "max-h-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-col",
          sheetExpanded ? "max-h-[min(52dvh,24rem)]" : "max-h-none",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setSheetExpanded((value) => !value)}
          aria-expanded={sheetExpanded}
          aria-controls="recommendation-sheet-body"
          aria-label={
            sheetExpanded ? t("agent.recommend.collapseSheet") : t("agent.recommend.expandSheet")
          }
          className="flex w-full shrink-0 flex-col items-center border-b border-[var(--rb-border)] pt-2 pb-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--rb-border)_16%,var(--rb-card-bg))] active:bg-[color-mix(in_srgb,var(--rb-border)_24%,var(--rb-card-bg))]"
        >
          <span
            aria-hidden
            className="mb-2 h-1 w-10 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--rb-text-secondary)_35%,var(--rb-border))]"
          />
          <span className="flex w-full items-center gap-2 px-4">
            <span className="min-w-0 flex-1">
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
            </span>
            <SheetChevron expanded={sheetExpanded} />
          </span>
        </button>

        {sheetExpanded ? (
          <div
            id="recommendation-sheet-body"
            className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2"
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
