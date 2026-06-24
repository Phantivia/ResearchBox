import { useMemo, useState } from "react";
import {
  InclusionError,
  includePaperFromSearch,
  routeIdForSearchHit,
} from "@/core/agent/inclusion";
import type { PaperRecommendation } from "@/core/agent/recommendation/types";
import { useTranslation } from "@/i18n";
import { usePaperStore } from "@/store";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface PaperRecommendationCardProps {
  projectId: string;
  recommendation: PaperRecommendation;
}

type IncludeState = "idle" | "including" | "included" | "failed";

export function PaperRecommendationCard({
  projectId,
  recommendation,
}: PaperRecommendationCardProps) {
  const { t } = useTranslation();
  const papers = usePaperStore((state) => state.papers);
  const expectedRouteId = useMemo(
    () => routeIdForSearchHit(recommendation.arxivId),
    [recommendation.arxivId],
  );
  const alreadyInBox = useMemo(
    () => papers.some((paper) => paper.routeId === expectedRouteId),
    [papers, expectedRouteId],
  );

  const [includeState, setIncludeState] = useState<IncludeState>(
    alreadyInBox ? "included" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showIncluded = includeState === "included" || alreadyInBox;
  const showIncluding = includeState === "including";
  const showFailed = includeState === "failed";

  async function handleInclude() {
    if (alreadyInBox || showIncluding || showIncluded) {
      return;
    }

    setIncludeState("including");
    setErrorMessage(null);

    try {
      await includePaperFromSearch({ projectId, arxivId: recommendation.arxivId });
      setIncludeState("included");
    } catch (error) {
      setIncludeState("failed");
      if (error instanceof InclusionError) {
        setErrorMessage(t("agent.search.invalidArxivId"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(t("agent.search.includeFailed"));
      }
    }
  }

  return (
    <article className="rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge provenance="academic" />
            <span className="truncate text-xs text-[var(--rb-text-secondary)]">
              {recommendation.arxivId}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-[var(--rb-text-primary)]">
            {t("agent.recommend.reason")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--rb-text-secondary)]">
            {recommendation.reason}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {alreadyInBox ? (
            <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-[var(--rb-text-secondary)]">
              {t("agent.search.alreadyInBox")}
            </span>
          ) : showIncluded ? (
            <span className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
              {t("agent.search.included")}
            </span>
          ) : showIncluding ? (
            <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              {t("agent.search.including")}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void handleInclude()}
              className="rounded-md bg-[var(--rb-primary)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {t("agent.search.include")}
            </button>
          )}
        </div>
      </div>

      {recommendation.abstract ? (
        <>
          <p className="mt-2 text-xs font-medium text-[var(--rb-text-primary)]">
            {t("agent.recommend.abstract")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--rb-text-secondary)]">
            {recommendation.abstract}
          </p>
        </>
      ) : null}

      {showFailed && errorMessage ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </article>
  );
}
