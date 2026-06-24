import { useMemo, useState } from "react";
import {
  InclusionError,
  includePaperFromSearch,
  routeIdForSearchHit,
} from "@/core/agent/inclusion";
import {
  truncateRecommendationTitle,
  RECOMMENDATION_TITLE_MAX_CARD,
} from "@/core/agent/recommendation/display";
import type { RecommendationDecision } from "@/core/agent/recommendation/markers";
import type { PaperRecommendation } from "@/core/agent/recommendation/types";
import { useTranslation } from "@/i18n";
import { usePaperStore } from "@/store";
import { ExpandChevron } from "./ExpandChevron";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface RecommendationPaperItemProps {
  projectId: string;
  recommendation: PaperRecommendation;
  decision?: RecommendationDecision;
  compact?: boolean;
  onDecisionChange: (
    arxivId: string,
    decision: RecommendationDecision | null,
  ) => void | Promise<void>;
}

type IncludeState = "idle" | "including" | "failed";

export function RecommendationPaperItem({
  projectId,
  recommendation,
  decision,
  compact = false,
  onDecisionChange,
}: RecommendationPaperItemProps) {
  const { t } = useTranslation();
  const papers = usePaperStore((state) => state.papers);
  const [expanded, setExpanded] = useState(!compact);
  const [includeState, setIncludeState] = useState<IncludeState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const expectedRouteId = useMemo(
    () => routeIdForSearchHit(recommendation.arxivId),
    [recommendation.arxivId],
  );
  const alreadyInBox = useMemo(
    () => papers.some((paper) => paper.routeId === expectedRouteId),
    [papers, expectedRouteId],
  );

  const effectiveDecision = alreadyInBox && decision !== "ignored" ? "included" : decision;
  const showIncluding = includeState === "including";
  const showFailed = includeState === "failed";

  async function handleInclude() {
    if (effectiveDecision === "included") {
      if (alreadyInBox) {
        return;
      }
      await onDecisionChange(recommendation.arxivId, null);
      return;
    }

    setIncludeState("including");
    setErrorMessage(null);

    try {
      if (!alreadyInBox) {
        await includePaperFromSearch({ projectId, arxivId: recommendation.arxivId });
      }
      await onDecisionChange(recommendation.arxivId, "included");
      setIncludeState("idle");
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

  async function handleIgnore() {
    if (effectiveDecision === "ignored") {
      await onDecisionChange(recommendation.arxivId, null);
      return;
    }
    await onDecisionChange(recommendation.arxivId, "ignored");
  }

  const includeActive = effectiveDecision === "included";
  const ignoreActive = effectiveDecision === "ignored";
  const displayTitle = truncateRecommendationTitle(
    recommendation.title,
    RECOMMENDATION_TITLE_MAX_CARD,
  );
  const showCompactPeek = compact && !expanded;

  function handleCompactToggle() {
    if (!compact) {
      return;
    }
    setExpanded((value) => !value);
  }

  return (
    <article
      className={[
        "rounded-lg border bg-[var(--rb-card-bg)] shadow-sm transition-colors duration-200",
        ignoreActive
          ? "border-[var(--rb-border)] opacity-70"
          : includeActive
            ? "border-green-200 ring-1 ring-inset ring-green-100"
            : "border-[var(--rb-border)]",
        showCompactPeek ? "cursor-pointer active:bg-[color-mix(in_srgb,var(--rb-border)_12%,var(--rb-card-bg))]" : "",
      ].join(" ")}
      onClick={showCompactPeek ? handleCompactToggle : undefined}
      onKeyDown={
        showCompactPeek
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleCompactToggle();
              }
            }
          : undefined
      }
      role={showCompactPeek ? "button" : undefined}
      tabIndex={showCompactPeek ? 0 : undefined}
      aria-expanded={compact ? expanded : undefined}
    >
      <div className={compact ? "px-3 py-2" : "p-3"}>
        {showCompactPeek ? (
          <div className="min-w-0">
            <h3
              className="line-clamp-1 text-sm font-medium leading-snug text-[var(--rb-text-primary)]"
              title={recommendation.title}
            >
              {displayTitle}
            </h3>
            <p className="line-clamp-1 text-xs leading-snug text-[var(--rb-text-secondary)]">
              {recommendation.reason}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2">
              {compact ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpanded(false);
                  }}
                  className="mt-0.5 flex shrink-0 items-center text-[var(--rb-text-secondary)] hover:text-[var(--rb-text-primary)]"
                  aria-expanded={expanded}
                  aria-label={t("agent.recommend.collapseSheet")}
                >
                  <ExpandChevron expanded={expanded} />
                </button>
              ) : null}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ProvenanceBadge provenance="academic" />
                  <span className="truncate text-xs text-[var(--rb-text-secondary)]">
                    {recommendation.arxivId}
                  </span>
                </div>
                <h3
                  className="mt-1 text-sm font-semibold leading-snug text-[var(--rb-text-primary)]"
                  title={recommendation.title}
                >
                  {displayTitle}
                </h3>

                <p className="mt-2 text-xs font-medium text-[var(--rb-text-primary)]">
                  {t("agent.recommend.reason")}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--rb-text-secondary)]">
                  {recommendation.reason}
                </p>
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
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {alreadyInBox && effectiveDecision !== "ignored" ? (
                <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-[var(--rb-text-secondary)]">
                  {t("agent.search.alreadyInBox")}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => void handleIgnore()}
                disabled={showIncluding}
                className={[
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--rb-border)]",
                  ignoreActive
                    ? "bg-[color-mix(in_srgb,var(--rb-text-secondary)_18%,var(--rb-card-bg))] text-[var(--rb-text-primary)] ring-1 ring-inset ring-[var(--rb-border)]"
                    : "border border-[var(--rb-border)] bg-[var(--rb-card-bg)] text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_30%,var(--rb-card-bg))]",
                ].join(" ")}
              >
                {ignoreActive ? t("agent.recommend.ignored") : t("agent.recommend.ignore")}
              </button>

              <button
                type="button"
                onClick={() => void handleInclude()}
                disabled={showIncluding || (alreadyInBox && includeActive)}
                className={[
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2",
                  includeActive || alreadyInBox
                    ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200"
                    : "bg-[var(--rb-primary)] text-white hover:bg-[var(--rb-primary-hover)] focus:ring-blue-300",
                ].join(" ")}
              >
                {showIncluding
                  ? t("agent.search.including")
                  : includeActive || alreadyInBox
                    ? t("agent.search.included")
                    : t("agent.search.include")}
              </button>
            </div>

            {showFailed && errorMessage ? (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
