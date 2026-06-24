import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

const INPUT_PREVIEW_LENGTH = 160;

function formatInputSummary(input: unknown): string {
  try {
    const text = JSON.stringify(input);
    if (text.length <= INPUT_PREVIEW_LENGTH) {
      return text;
    }
    return `${text.slice(0, INPUT_PREVIEW_LENGTH).trimEnd()}…`;
  } catch {
    return String(input);
  }
}

export function ApprovalDialog() {
  const { t } = useTranslation();
  const pending = useAgentStore((state) => state.pendingApprovals[0]);
  const resolveApproval = useAgentStore((state) => state.resolveApproval);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleApprove = useCallback(() => {
    if (!pending) {
      return;
    }
    resolveApproval(pending.id, true);
  }, [pending, resolveApproval]);

  const handleReject = useCallback(() => {
    if (!pending) {
      return;
    }
    resolveApproval(pending.id, false);
  }, [pending, resolveApproval]);

  useEffect(() => {
    if (!pending) {
      return;
    }
    dialogRef.current?.focus();
  }, [pending?.id]);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleApprove();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleReject();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, handleApprove, handleReject]);

  if (!pending) {
    return null;
  }

  const isHighRisk = pending.risk === "high";
  const borderClass = isHighRisk
    ? "border-red-400 dark:border-red-600 ring-2 ring-red-400/30 dark:ring-red-600/30"
    : "border-amber-400 dark:border-amber-600";
  const headerBg = isHighRisk
    ? "bg-[color-mix(in_srgb,red_12%,var(--rb-card-bg))]"
    : "bg-[color-mix(in_srgb,amber_10%,var(--rb-card-bg))]";
  const riskBadgeClass = isHighRisk
    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-dialog-title"
      tabIndex={-1}
      className={`mx-auto max-w-3xl rounded-lg border-2 shadow-lg ${borderClass} ${headerBg}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p
            id="approval-dialog-title"
            className="text-sm font-semibold text-[var(--rb-text-primary)]"
          >
            {t("agent.approval.title")}
          </p>
          <p className="mt-0.5 font-mono text-sm text-[var(--rb-text-primary)]">
            {pending.tool}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${riskBadgeClass}`}
        >
          {isHighRisk ? t("agent.approval.riskHigh") : t("agent.approval.riskLow")}
        </span>
      </div>

      <div className="space-y-3 border-t border-[var(--rb-border)] px-4 py-3">
        <div>
          <p className="text-xs font-medium text-[var(--rb-text-secondary)]">
            {t("agent.approval.reason")}
          </p>
          <p className="mt-1 text-sm text-[var(--rb-text-primary)]">{pending.reason}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--rb-text-secondary)]">
            {t("agent.approval.input")}
          </p>
          <pre className="mt-1 overflow-x-auto rounded border border-dashed border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_20%,var(--rb-page-bg))] px-2 py-1.5 text-xs leading-relaxed text-[var(--rb-text-secondary)]">
            {formatInputSummary(pending.input)}
          </pre>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleApprove}
            className={`rounded-sm px-4 py-1.5 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              isHighRisk
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                : "bg-[var(--rb-primary)] hover:opacity-90 focus:ring-[var(--rb-primary)]"
            }`}
          >
            {t("agent.approval.approve")}
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="rounded-sm border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-4 py-1.5 text-sm font-medium text-[var(--rb-text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--rb-border)_30%,var(--rb-card-bg))] focus:outline-none focus:ring-2 focus:ring-[var(--rb-border)]"
          >
            {t("agent.approval.reject")}
          </button>
          <span className="text-xs text-[var(--rb-text-secondary)]">
            {t("agent.approval.enterHint")}
          </span>
        </div>
      </div>
    </div>
  );
}
