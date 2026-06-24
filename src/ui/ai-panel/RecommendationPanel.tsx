import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { RecommendationPaperItem } from "./RecommendationPaperItem";

function RecommendationPanelBody({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const session = useAgentStore((state) => state.recommendationSession);
  const setRecommendationDecision = useAgentStore((state) => state.setRecommendationDecision);

  if (!session) {
    return null;
  }

  const pendingCount = session.papers.filter(
    (paper) => session.decisions[paper.arxivId] === undefined,
  ).length;

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rb-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--rb-text-secondary)]">
            {t("agent.recommend.panelEyebrow")}
          </p>
          <h2
            id="recommendation-panel-title"
            className="mt-0.5 text-lg font-semibold text-[var(--rb-text-primary)]"
          >
            {t("agent.recommend.panelTitle", { count: session.papers.length })}
          </h2>
          {pendingCount > 0 ? (
            <p className="mt-1 text-xs text-[var(--rb-text-secondary)]">
              {t("agent.recommend.panelPending", { count: pendingCount })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("agent.recommend.closePanel")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_50%,transparent)]"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {session.papers.map((paper) => (
          <RecommendationPaperItem
            key={paper.arxivId}
            projectId={projectId}
            recommendation={paper}
            decision={session.decisions[paper.arxivId]}
            onDecisionChange={async (arxivId, decision) => {
              setRecommendationDecision(arxivId, decision);
            }}
          />
        ))}
      </div>
    </>
  );
}

export interface RecommendationPanelProps {
  projectId: string;
}

export function RecommendationPanel({ projectId }: RecommendationPanelProps) {
  const session = useAgentStore((state) => state.recommendationSession);
  const closeRecommendationSession = useAgentStore((state) => state.closeRecommendationSession);
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

  const handleClose = useCallback(() => {
    closeRecommendationSession();
  }, [closeRecommendationSession]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, mounted]);

  if (!mounted) {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="recommendation-panel-title"
      className={[
        "hidden min-h-0 shrink-0 flex-col overflow-hidden border-[var(--rb-border)] bg-[var(--rb-card-bg)] transition-[width,opacity] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex",
        visible
          ? "w-[min(420px,38vw)] border-l opacity-100"
          : "w-0 border-l-0 opacity-0 pointer-events-none",
      ].join(" ")}
    >
      <RecommendationPanelBody projectId={projectId} onClose={handleClose} />
    </aside>
  );
}

function CloseIcon() {
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
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
