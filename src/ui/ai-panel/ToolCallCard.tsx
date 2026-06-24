import { useState } from "react";
import {
  parseProvenanceFromContent,
  provenanceForToolName,
} from "@/core/agent/provenance";
import { parsePaperRecommendations } from "@/core/agent/recommendation/types";
import { useTranslation } from "@/i18n";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { PaperRecommendationCard } from "./PaperRecommendationCard";
import { ExpandChevron } from "./ExpandChevron";
import { PythonCodePanel } from "./PythonCodePanel";

const RESULT_PREVIEW_LINES = 4;
const RESULT_PREVIEW_CHARS = 240;

const PROVENANCE_I18N = {
  paperbox: "agent.provenance.paperbox",
  academic: "agent.provenance.academic",
  web: "agent.provenance.web",
} as const;

export interface ToolCallCardProps {
  name: string;
  input: unknown;
  stage?: string;
  result?: string;
  isError?: boolean;
  projectId?: string;
}

function parsePythonInput(input: unknown): { code: string; purpose?: string } | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (typeof record.code !== "string") {
    return null;
  }
  return {
    code: record.code,
    purpose: typeof record.purpose === "string" ? record.purpose : undefined,
  };
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatResultText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return text;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function compactPreview(text: string, maxLines: number, maxChars: number): string {
  const lines = text.split("\n");
  const limitedLines = lines.slice(0, maxLines);
  let preview = limitedLines.join("\n");
  if (lines.length > maxLines) {
    preview = `${preview.trimEnd()}\n…`;
  }
  if (preview.length > maxChars) {
    preview = `${preview.slice(0, maxChars).trimEnd()}…`;
  }
  return preview;
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

const codeBlockClass =
  "mt-1 max-h-64 overflow-auto rounded border border-dashed px-2 py-1.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words";

export function ToolCallCard({
  name,
  input,
  stage,
  result,
  isError = false,
  projectId,
}: ToolCallCardProps) {
  const { t } = useTranslation();
  const [cardExpanded, setCardExpanded] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const running = result === undefined;
  const pythonInput = name === "python" ? parsePythonInput(input) : null;
  const inputJson = formatJson(input);
  const formattedResult = result !== undefined ? formatResultText(result) : undefined;
  const paperRecommendations =
    name === "recommend_papers" && formattedResult && !isError
      ? parsePaperRecommendations(formattedResult)
      : null;
  const provenance =
    (formattedResult ? parseProvenanceFromContent(formattedResult) : null) ??
    provenanceForToolName(name);

  const borderClass = isError ? "text-red-600 dark:text-red-400" : "";
  const headerTextClass = isError
    ? "text-red-600 dark:text-red-400"
    : "text-[var(--rb-text-secondary)]";

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        onClick={() => setCardExpanded((value) => !value)}
        className={`flex w-full min-w-0 items-center gap-2 px-0 py-1 text-left text-xs transition-colors hover:text-[var(--rb-text-primary)] ${headerTextClass}`}
        aria-expanded={cardExpanded}
      >
        <ExpandChevron expanded={cardExpanded} />
        <span className="min-w-0 truncate font-medium">
          {name}
        </span>
        {provenance ? (
          <span className="shrink-0 text-xs text-[var(--rb-text-secondary)]">
            {t(PROVENANCE_I18N[provenance])}
          </span>
        ) : null}
        {running ? (
          <span className="inline-flex shrink-0 items-center gap-1.5">
            {cardExpanded ? (stage ?? t("agent.tool.running")) : null}
            <RunningDots />
          </span>
        ) : null}
        {isError ? (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium ${borderClass}`}>
            {t("agent.tool.error")}
          </span>
        ) : null}
        {!running && !isError && cardExpanded ? (
          <span className="shrink-0 text-[0.6875rem]">
            {t("agent.tool.done")}
          </span>
        ) : null}
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: cardExpanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
      <div className="px-0 py-1">
        {pythonInput ? (
          <>
            <button
              type="button"
              onClick={() => setInputExpanded((value) => !value)}
              className="mb-2 flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--rb-text-secondary)] hover:text-[var(--rb-text-primary)]"
              aria-expanded={inputExpanded}
            >
              <ExpandChevron expanded={inputExpanded} />
              {t("agent.tool.input")}
            </button>
            <PythonCodePanel
              code={pythonInput.code}
              purpose={pythonInput.purpose}
              maxHeightClass={inputExpanded ? "max-h-80" : "max-h-24"}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setInputExpanded((value) => !value)}
              className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--rb-text-secondary)] hover:text-[var(--rb-text-primary)]"
              aria-expanded={inputExpanded}
            >
              <ExpandChevron expanded={inputExpanded} />
              {t("agent.tool.input")}
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-in-out"
              style={{ gridTemplateRows: inputExpanded ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <pre
                  className={`${codeBlockClass} max-h-48 border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_20%,var(--rb-page-bg))] text-[var(--rb-text-secondary)]`}
                >
                  {inputJson}
                </pre>
              </div>
            </div>
            {!inputExpanded ? (
              <pre
                className={`${codeBlockClass} max-h-24 border-transparent bg-transparent px-0 py-0 text-[var(--rb-text-secondary)]`}
              >
                {compactPreview(inputJson, RESULT_PREVIEW_LINES, RESULT_PREVIEW_CHARS)}
              </pre>
            ) : null}
          </>
        )}
      </div>

      {paperRecommendations && projectId ? (
        <div className="space-y-2 px-0 py-1">
          {paperRecommendations.map((recommendation) => (
            <PaperRecommendationCard
              key={recommendation.arxivId}
              projectId={projectId}
              recommendation={recommendation}
            />
          ))}
        </div>
      ) : null}

      {formattedResult !== undefined && paperRecommendations === null ? (
        <div className="px-0 py-1">
          <button
            type="button"
            onClick={() => setResultExpanded((value) => !value)}
            className={`flex w-full items-center gap-2 text-left text-xs font-medium ${isError ? "text-red-600 dark:text-red-400" : "text-[var(--rb-text-secondary)] hover:text-[var(--rb-text-primary)]"}`}
            aria-expanded={resultExpanded}
          >
            <ExpandChevron expanded={resultExpanded} />
            {t("agent.tool.result")}
            {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
            style={{ gridTemplateRows: resultExpanded ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <pre
                className={`${codeBlockClass} ${
                  isError
                    ? "border-red-200 bg-[color-mix(in_srgb,red_6%,var(--rb-page-bg))] text-red-700 dark:border-red-900 dark:text-red-300"
                    : "border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_20%,var(--rb-page-bg))] text-[var(--rb-text-secondary)]"
                }`}
              >
                {formattedResult}
              </pre>
            </div>
          </div>
          {!resultExpanded ? (
            <pre
              className={`${codeBlockClass} max-h-24 border-transparent bg-transparent px-0 py-0 ${
                isError ? "text-red-600 dark:text-red-400" : "text-[var(--rb-text-secondary)]"
              }`}
            >
              {compactPreview(formattedResult, RESULT_PREVIEW_LINES, RESULT_PREVIEW_CHARS)}
            </pre>
          ) : null}
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}
