import { useState } from "react";
import { useTranslation } from "@/i18n";

const RESULT_PREVIEW_LENGTH = 120;

export interface ToolCallCardProps {
  name: string;
  input: unknown;
  stage?: string;
  result?: string;
  isError?: boolean;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resultPreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= RESULT_PREVIEW_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, RESULT_PREVIEW_LENGTH).trimEnd()}…`;
}

function RunningDots() {
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

export function ToolCallCard({
  name,
  input,
  stage,
  result,
  isError = false,
}: ToolCallCardProps) {
  const { t } = useTranslation();
  const [inputExpanded, setInputExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const running = result === undefined;
  const inputJson = formatJson(input);

  const borderClass = isError
    ? "border-red-300 dark:border-red-800"
    : "border-[var(--rb-border)]";
  const headerBg = isError
    ? "bg-[color-mix(in_srgb,red_8%,var(--rb-page-bg))]"
    : "bg-[color-mix(in_srgb,var(--rb-border)_35%,var(--rb-page-bg))]";

  return (
    <div className={`w-full rounded-lg border ${borderClass} ${headerBg}`}>
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="shrink-0 font-medium text-[var(--rb-text-primary)]">
          {name}
        </span>
        {running ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[var(--rb-text-secondary)]">
            {stage ?? t("agent.tool.running")}
            <RunningDots />
          </span>
        ) : null}
        {isError ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
            {t("agent.tool.error")}
          </span>
        ) : null}
        {!running && !isError ? (
          <span className="shrink-0 text-xs text-[var(--rb-text-secondary)]">
            {t("agent.tool.done")}
          </span>
        ) : null}
      </div>

      <div className="border-t border-[var(--rb-border)] px-3 py-2">
        <button
          type="button"
          onClick={() => setInputExpanded((value) => !value)}
          className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--rb-text-secondary)] hover:text-[var(--rb-text-primary)]"
          aria-expanded={inputExpanded}
        >
          <span
            className={`shrink-0 transition-transform duration-200 ${inputExpanded ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▶
          </span>
          {t("agent.tool.input")}
        </button>
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{ gridTemplateRows: inputExpanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <pre className="mt-1 max-h-48 overflow-auto rounded border border-dashed border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_20%,var(--rb-page-bg))] px-2 py-1.5 text-xs leading-relaxed text-[var(--rb-text-secondary)]">
              {inputJson}
            </pre>
          </div>
        </div>
        {!inputExpanded ? (
          <p className="mt-1 truncate text-xs text-[var(--rb-text-secondary)]">
            {inputJson.replace(/\s+/g, " ")}
          </p>
        ) : null}
      </div>

      {result !== undefined ? (
        <div
          className={`border-t px-3 py-2 ${isError ? "border-red-200 dark:border-red-900" : "border-[var(--rb-border)]"}`}
        >
          <button
            type="button"
            onClick={() => setResultExpanded((value) => !value)}
            className={`flex w-full items-center gap-2 text-left text-xs font-medium ${isError ? "text-red-600 dark:text-red-400" : "text-[var(--rb-text-secondary)] hover:text-[var(--rb-text-primary)]"}`}
            aria-expanded={resultExpanded}
          >
            <span
              className={`shrink-0 transition-transform duration-200 ${resultExpanded ? "rotate-90" : ""}`}
              aria-hidden
            >
              ▶
            </span>
            {t("agent.tool.result")}
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
            style={{ gridTemplateRows: resultExpanded ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <pre
                className={`mt-1 max-h-64 overflow-auto rounded border border-dashed px-2 py-1.5 text-xs leading-relaxed ${
                  isError
                    ? "border-red-200 bg-[color-mix(in_srgb,red_6%,var(--rb-page-bg))] text-red-700 dark:border-red-900 dark:text-red-300"
                    : "border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_20%,var(--rb-page-bg))] text-[var(--rb-text-secondary)]"
                }`}
              >
                {result}
              </pre>
            </div>
          </div>
          {!resultExpanded ? (
            <p
              className={`mt-1 truncate text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-[var(--rb-text-secondary)]"}`}
            >
              {resultPreview(result)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
