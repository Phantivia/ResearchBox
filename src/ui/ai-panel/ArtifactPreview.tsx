import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import type { Artifact } from "@/core/agent/artifact/schema";
import { useTranslation } from "@/i18n";
import { MathBlock } from "@/ui/reader/MathBlock";
import { linkifyArtifactCitations, splitMarkdownWithMath } from "./artifactMarkdown";

export interface ArtifactPreviewProps {
  artifact: Artifact;
  onClose: () => void;
}

function ArtifactMarkdown({ content }: { content: string }) {
  const { t } = useTranslation();
  const segments = splitMarkdownWithMath(linkifyArtifactCitations(content));

  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith("cite:")) {
        const citationId = decodeURIComponent(href.slice(5));
        return (
          <button
            type="button"
            title={t("agent.artifact.citationHint", { id: citationId })}
            className="mx-0.5 inline rounded bg-[color-mix(in_srgb,var(--rb-primary)_12%,transparent)] px-1 py-0.5 font-mono text-xs text-[var(--rb-primary)] hover:underline"
            onClick={() => {
              // Navigation to reader block can be wired here later.
            }}
          >
            {children}
          </button>
        );
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--rb-primary)] hover:underline"
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div className="prose prose-sm max-w-none text-[var(--rb-text-primary)] prose-headings:text-[var(--rb-text-primary)] prose-p:text-[var(--rb-text-primary)] prose-strong:text-[var(--rb-text-primary)] prose-code:text-[var(--rb-text-primary)] prose-table:text-[var(--rb-text-primary)]">
      {segments.map((segment, index) => {
        if (segment.kind === "math") {
          return segment.display ? (
            <div key={index} className="my-4 overflow-x-auto">
              <MathBlock tex={segment.tex} display />
            </div>
          ) : (
            <span key={index} className="inline-math">
              <MathBlock tex={segment.tex} display={false} />
            </span>
          );
        }

        return (
          <Markdown key={index} components={components}>
            {segment.value}
          </Markdown>
        );
      })}
    </div>
  );
}

export function ArtifactPreview({ artifact, onClose }: ArtifactPreviewProps) {
  const { t } = useTranslation();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [handleClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4 py-8"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="artifact-preview-title"
    >
      <div
        className="flex max-h-[min(90dvh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--rb-border)] bg-[var(--rb-card-bg)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rb-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--rb-text-secondary)]">
              {t(`agent.artifact.kind.${artifact.kind}`)}
            </p>
            <h2
              id="artifact-preview-title"
              className="mt-0.5 truncate text-lg font-semibold text-[var(--rb-text-primary)]"
            >
              {artifact.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("agent.artifact.closePreview")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_50%,transparent)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ArtifactMarkdown content={artifact.content} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CloseIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
