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

  const isOpen = session !== null;

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      const timer = window.setTimeout(() => setMounted(false), 240);
      return () => window.clearTimeout(timer);
    }

    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
  }, [isOpen]);

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
        "absolute bottom-full left-0 right-0 z-30 max-h-[min(52dvh,24rem)] overflow-hidden border border-b-0 border-[var(--rb-border)] bg-[var(--rb-card-bg)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-all duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      ].join(" ")}
    >
      <div className="flex max-h-[min(52dvh,24rem)] flex-col">
        <div className="shrink-0 border-b border-[var(--rb-border)] px-4 py-3">
          <p
            id="recommendation-sheet-title"
            className="text-sm font-semibold text-[var(--rb-text-primary)]"
          >
            {t("agent.recommend.panelTitle", { count: session.papers.length })}
          </p>
          {pendingCount > 0 ? (
            <p className="mt-0.5 text-xs text-[var(--rb-text-secondary)]">
              {t("agent.recommend.panelPending", { count: pendingCount })}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
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
      </div>
    </div>
  );
}
