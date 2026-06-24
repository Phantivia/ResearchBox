import { useState } from "react";
import { useTranslation } from "@/i18n";

export interface ThinkingBlockProps {
  text: string;
  streaming?: boolean;
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

export function ThinkingBlock({ text, streaming = false }: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full max-w-[min(100%,42rem)] items-center gap-2 rounded-lg border border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_35%,var(--rb-page-bg))] px-3 py-2 text-left text-xs text-[var(--rb-text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--rb-border)_50%,var(--rb-page-bg))]"
        aria-expanded={expanded}
      >
        <span
          className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▶
        </span>
        <span className="font-medium">{t("agent.thinkingLabel")}</span>
        {streaming ? (
          <span className="inline-flex items-center gap-1.5 italic">
            {t("agent.thinkingStreaming")}
            <ThinkingDots />
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="mt-1 max-w-[min(100%,42rem)] rounded-lg border border-dashed border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_25%,var(--rb-page-bg))] px-3 py-2">
          <pre className="whitespace-pre-wrap font-mono text-xs italic leading-relaxed text-[var(--rb-text-secondary)]">
            {text}
            {streaming ? <span className="not-italic">▍</span> : null}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
