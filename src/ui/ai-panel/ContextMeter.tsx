import { useCallback, useEffect, useState } from "react";
import type { ContextTokenBreakdown } from "@/core/agent/contextSize";
import { contextUsageRatio, totalContextTokens } from "@/core/agent/contextSize";
import type { MessageKey } from "@/core/i18n";
import { useTranslation } from "@/i18n";

export interface ContextMeterProps {
  breakdown: ContextTokenBreakdown;
  contextWindow: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BreakdownKey = keyof ContextTokenBreakdown;

const SEGMENT_COLORS: Record<BreakdownKey, string> = {
  systemPrompt: "bg-violet-500",
  toolDefinition: "bg-sky-500",
  toolIO: "bg-amber-500",
  conversation: "bg-[var(--rb-primary)]",
};

const SEGMENT_RING_COLORS: Record<BreakdownKey, string> = {
  systemPrompt: "#8b5cf6",
  toolDefinition: "#0ea5e9",
  toolIO: "#f59e0b",
  conversation: "var(--rb-primary)",
};

const SEGMENT_LABEL_KEYS = {
  systemPrompt: "agent.contextBreakdown.systemPrompt",
  toolDefinition: "agent.contextBreakdown.toolDefinition",
  toolIO: "agent.contextBreakdown.toolIO",
  conversation: "agent.contextBreakdown.conversation",
} as const satisfies Record<BreakdownKey, MessageKey>;

const BREAKDOWN_ORDER: BreakdownKey[] = [
  "systemPrompt",
  "toolDefinition",
  "toolIO",
  "conversation",
];

function resolveRingColor(percent: number): string {
  if (percent > 95) {
    return "#ef4444";
  }
  if (percent > 80) {
    return "#f97316";
  }
  return "var(--rb-primary)";
}

export function ContextMeter({
  breakdown,
  contextWindow,
  open,
  onOpenChange,
}: ContextMeterProps) {
  const { t } = useTranslation();
  const tokens = totalContextTokens(breakdown);
  const ratio = contextUsageRatio(tokens, contextWindow);
  const percent = Math.min(100, Math.round(ratio * 100));

  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - ratio);
  const ringColor = resolveRingColor(percent);

  return (
    <button
      type="button"
      data-context-meter-trigger
      onClick={() => onOpenChange(!open)}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_35%,transparent)]"
      aria-label={t("agent.contextAria", { percent: String(percent) })}
      aria-expanded={open}
      title={t("agent.contextUsage", {
        tokens: tokens.toLocaleString(),
        percent: String(percent),
      })}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-[color-mix(in_srgb,var(--rb-border)_60%,var(--rb-page-bg))]"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset,stroke] duration-300 ease-out"
        />
      </svg>
    </button>
  );
}

export interface ContextDetailSheetProps {
  breakdown: ContextTokenBreakdown;
  contextWindow: number;
  open: boolean;
  onClose: () => void;
}

export function ContextDetailSheet({
  breakdown,
  contextWindow,
  open,
  onClose,
}: ContextDetailSheetProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const tokens = totalContextTokens(breakdown);
  const safeWindow = Math.max(contextWindow, 1);
  const ratio = contextUsageRatio(tokens, contextWindow);
  const percent = Math.min(100, Math.round(ratio * 100));

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      const timer = window.setTimeout(() => setMounted(false), 240);
      return () => window.clearTimeout(timer);
    }

    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
  }, [open]);

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

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-context-meter-trigger]")) {
        return;
      }
      const sheet = document.getElementById("context-detail-sheet");
      if (sheet?.contains(target)) {
        return;
      }
      handleClose();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [handleClose, mounted]);

  const segments = BREAKDOWN_ORDER.map((key) => ({
    key,
    tokens: breakdown[key],
    ratio: breakdown[key] / safeWindow,
  })).filter((segment) => segment.tokens > 0);

  if (!mounted) {
    return null;
  }

  return (
    <div
      id="context-detail-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="context-detail-title"
      className={[
        "absolute bottom-full left-0 right-0 z-30 overflow-hidden border border-b-0 border-[var(--rb-border)] bg-[var(--rb-card-bg)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-all duration-240 ease-[cubic-bezier(0.32,0.72,0,1)]",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      ].join(" ")}
    >
      <div className="px-3 py-3 sm:px-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2
            id="context-detail-title"
            className="text-sm font-medium text-[var(--rb-text-primary)]"
          >
            {t("agent.contextDetailTitle")}
          </h2>
          <span className="text-xs text-[var(--rb-text-secondary)]">
            {t("agent.contextUsage", {
              tokens: tokens.toLocaleString(),
              percent: String(percent),
            })}
          </span>
        </div>

        <div
          className="flex h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--rb-border)_40%,var(--rb-page-bg))]"
          role="img"
          aria-label={t("agent.contextBreakdownAria")}
        >
          {segments.map((segment) => (
            <div
              key={segment.key}
              className={`h-full ${SEGMENT_COLORS[segment.key]}`}
              style={{ width: `${segment.ratio * 100}%` }}
              title={t(SEGMENT_LABEL_KEYS[segment.key])}
            />
          ))}
        </div>

        <ul className="mt-3 space-y-1.5">
          {BREAKDOWN_ORDER.map((key) => {
            const segmentTokens = breakdown[key];
            const segmentShare =
              tokens > 0 ? Math.round((segmentTokens / tokens) * 100) : 0;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-[var(--rb-text-secondary)]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEGMENT_RING_COLORS[key] }}
                    aria-hidden
                  />
                  <span className="truncate">{t(SEGMENT_LABEL_KEYS[key])}</span>
                </span>
                <span className="shrink-0 tabular-nums text-[var(--rb-text-primary)]">
                  {segmentTokens.toLocaleString()}
                  {tokens > 0 ? (
                    <span className="ml-1 text-[var(--rb-text-secondary)]">
                      ({segmentShare}%)
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
