import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Artifact } from "@/core/agent/artifact/schema";
import { useTranslation } from "@/i18n";
import { ArtifactMarkdownContent } from "./ArtifactMarkdownContent";

export interface ArtifactPreviewProps {
  artifact: Artifact;
  onClose: () => void;
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
          <ArtifactMarkdownContent content={artifact.content} />
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
