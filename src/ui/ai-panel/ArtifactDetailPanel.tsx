import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Artifact } from "@/core/agent/artifact/schema";
import { getArtifact } from "@/db";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { ArtifactMarkdownContent } from "./ArtifactMarkdownContent";

function ArtifactDetailBody({
  artifact,
  onClose,
}: {
  artifact: Artifact | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
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
            <p className="text-sm text-[var(--rb-text-secondary)]">{t("agent.artifact.loading")}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("agent.artifact.closePreview")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_50%,transparent)]"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {artifact ? <ArtifactMarkdownContent content={artifact.content} /> : null}
      </div>
    </>
  );
}

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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, mounted]);

  if (!mounted) {
    return null;
  }

  const desktopPanel = (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="artifact-detail-title"
      className={[
        "hidden min-h-0 shrink-0 flex-col overflow-hidden border-[var(--rb-border)] bg-[var(--rb-card-bg)] transition-[width,opacity] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex",
        visible
          ? "w-[min(480px,40vw)] border-l opacity-100"
          : "w-0 border-l-0 opacity-0 pointer-events-none",
      ].join(" ")}
    >
      <ArtifactDetailBody artifact={artifact} onClose={handleClose} />
    </aside>
  );

  const mobileOverlay = createPortal(
    <div className="fixed inset-0 z-[90] md:hidden" role="presentation">
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
          "absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,40rem)] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--rb-border)] bg-[var(--rb-card-bg)] shadow-2xl transition-transform duration-240 ease-[cubic-bezier(0.32,0.72,0,1)]",
          visible ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        <ArtifactDetailBody artifact={artifact} onClose={handleClose} />
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      {desktopPanel}
      {mobileOverlay}
    </>
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
