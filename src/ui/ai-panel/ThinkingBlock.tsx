import { useState } from "react";
import { useTranslation } from "@/i18n";
import { ExpandChevron } from "./ExpandChevron";

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
    <div className="w-full min-w-0">
      <button
        type="button"
        onClick={() =>
          setExpandedOverride((value) => !(value ?? !responseStarted))
        }
        className="flex w-full items-center gap-2 px-0 py-1 text-left text-xs text-[var(--rb-text-secondary)] transition-colors hover:text-[var(--rb-text-primary)]"
        aria-expanded={expanded}
      >
        <ExpandChevron expanded={expanded} className="duration-300" />
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
          <div className="mt-1 px-0 py-1">
            <div className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--rb-text-secondary)]">
              {text}
              {streaming && !responseStarted ? <span>▍</span> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
