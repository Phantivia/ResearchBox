import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Artifact } from "@/core/agent/artifact/schema";
import { getArtifact } from "@/db";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { ArtifactMarkdownContent } from "./ArtifactMarkdownContent";

export function ArtifactDetailPanel() {
  const { t } = useTranslation();
  const artifactPanel = useAgentStore((state) => state.artifactPanel);
  const closeArtifactPanel = useAgentStore((state) => state.closeArtifactPanel);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const artifactId = artifactPanel?.artifactId ?? null;

  useEffect(() => {
    if (!artifactId) {
      setVisible(false);
      const timer = window.setTimeout(() => {
        setMounted(false);
        setArtifact(null);
      }, 240);
      return () => window.clearTimeout(timer);
    }

    setMounted(true);
    requestAnimationFrame(() => setVisible(true));

    let cancelled = false;
    void getArtifact(artifactId).then((row) => {
      if (!cancelled) {
        setArtifact(row ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const handleClose = useCallback(() => {
    closeArtifactPanel();
  }, [closeArtifactPanel]);

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

    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [handleClose, mounted]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      <button
        type="button"
        aria-label={t("agent.artifact.closePreview")}
        className={[
          "absolute inset-0 bg-black/40 transition-opacity duration-240",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="artifact-detail-title"
        className={[
          "absolute flex flex-col overflow-hidden border-[var(--rb-border)] bg-[var(--rb-card-bg)] shadow-2xl transition-transform duration-240 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "inset-x-0 bottom-0 max-h-[min(88dvh,40rem)] rounded-t-2xl border-t md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[min(480px,90vw)] md:rounded-none md:border-l md:border-t-0",
          visible
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-y-0 md:translate-x-full",
        ].join(" ")}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--rb-border)] md:hidden" />

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rb-border)] px-4 py-3">
          <div className="min-w-0">
            {artifact ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--rb-text-secondary)]">
                  {t(`agent.artifact.kind.${artifact.kind}`)}
                </p>
                <h2
                  id="artifact-detail-title"
                  className="mt-0.5 truncate text-lg font-semibold text-[var(--rb-text-primary)]"
                >
                  {artifact.title}
                </h2>
              </>
            ) : (
              <p className="text-sm text-[var(--rb-text-secondary)]">
                {t("agent.artifact.loading")}
              </p>
            )}
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
          {artifact ? <ArtifactMarkdownContent content={artifact.content} /> : null}
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
