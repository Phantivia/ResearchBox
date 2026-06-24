import { useState } from "react";
import { useTranslation } from "@/i18n";

const THINKING_PREVIEW_LENGTH = 80;

export interface ThinkingBlockProps {
  text: string;
  streaming?: boolean;
  /** When true, the block collapses to a short preview (e.g. once the main reply starts). */
  responseStarted?: boolean;
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="inline-block h-1 w-1 rounded-full bg-[var(--rb-text-secondary)] animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function thinkingPreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= THINKING_PREVIEW_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, THINKING_PREVIEW_LENGTH).trimEnd()}…`;
}

export function ThinkingBlock({
  text,
  streaming = false,
  responseStarted = false,
}: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = expandedOverride ?? !responseStarted;
  const showPreview = responseStarted && !expanded;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() =>
          setExpandedOverride((value) => !(value ?? !responseStarted))
        }
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_35%,var(--rb-page-bg))] px-3 py-2 text-left text-sm text-[var(--rb-text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--rb-border)_50%,var(--rb-page-bg))]"
        aria-expanded={expanded}
      >
        <span
          className={`shrink-0 transition-transform duration-300 ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▶
        </span>
        <span className="shrink-0 font-medium">{t("agent.thinkingLabel")}</span>
        {streaming && !responseStarted ? (
          <span className="inline-flex shrink-0 items-center gap-1.5">
            {t("agent.thinkingStreaming")}
            <ThinkingDots />
          </span>
        ) : null}
        {showPreview ? (
          <span className="min-w-0 truncate text-[var(--rb-text-secondary)]">
            {thinkingPreview(text)}
          </span>
        ) : null}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="mt-1 rounded-lg border border-dashed border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_25%,var(--rb-page-bg))] px-3 py-2">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--rb-text-secondary)]">
              {text}
              {streaming && !responseStarted ? <span>▍</span> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
