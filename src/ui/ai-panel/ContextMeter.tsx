import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset as floatingOffset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useState } from "react";
import type { ContextTokenBreakdown } from "@/core/agent/contextSize";
import { contextUsageRatio, totalContextTokens } from "@/core/agent/contextSize";
import type { MessageKey } from "@/core/i18n";
import { useTranslation } from "@/i18n";

export interface ContextMeterProps {
  breakdown: ContextTokenBreakdown;
  contextWindow: number;
}

type BreakdownKey = keyof ContextTokenBreakdown;

const SEGMENT_COLORS: Record<BreakdownKey, string> = {
  systemPrompt: "bg-violet-500",
  conversation: "bg-[var(--rb-primary)]",
  toolUse: "bg-amber-500",
  toolResult: "bg-emerald-500",
};

const SEGMENT_RING_COLORS: Record<BreakdownKey, string> = {
  systemPrompt: "#8b5cf6",
  conversation: "var(--rb-primary)",
  toolUse: "#f59e0b",
  toolResult: "#10b981",
};

const SEGMENT_LABEL_KEYS = {
  systemPrompt: "agent.contextBreakdown.systemPrompt",
  conversation: "agent.contextBreakdown.conversation",
  toolUse: "agent.contextBreakdown.toolUse",
  toolResult: "agent.contextBreakdown.toolResult",
} as const satisfies Record<BreakdownKey, MessageKey>;

const BREAKDOWN_ORDER: BreakdownKey[] = [
  "systemPrompt",
  "conversation",
  "toolUse",
  "toolResult",
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

export function ContextMeter({ breakdown, contextWindow }: ContextMeterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tokens = totalContextTokens(breakdown);
  const safeWindow = Math.max(contextWindow, 1);
  const ratio = contextUsageRatio(tokens, contextWindow);
  const percent = Math.min(100, Math.round(ratio * 100));

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top-end",
    middleware: [floatingOffset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role]);

  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - ratio);
  const ringColor = resolveRingColor(percent);

  const segments = BREAKDOWN_ORDER.map((key) => ({
    key,
    tokens: breakdown[key],
    ratio: breakdown[key] / safeWindow,
    share: tokens > 0 ? breakdown[key] / tokens : 0,
  })).filter((segment) => segment.tokens > 0);

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps()}
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

      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 w-72 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-3 shadow-lg"
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-[var(--rb-text-primary)]">
                {t("agent.contextDetailTitle")}
              </span>
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
        </FloatingPortal>
      ) : null}
    </>
  );
}
