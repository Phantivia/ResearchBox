import { useCallback, useEffect, useState } from "react";
import type { Artifact, ArtifactKind } from "@/core/agent/artifact/schema";
import { deleteArtifact, listArtifacts } from "@/db";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

export interface ArtifactListViewProps {
  projectId: string;
  variant?: "compact" | "full";
}

function formatArtifactDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ArtifactKindIcon({ kind }: { kind: ArtifactKind }) {
  switch (kind) {
    case "summary":
      return <DocumentIcon />;
    case "compare-table":
      return <TableIcon />;
    case "outline":
      return <OutlineIcon />;
    case "note":
      return <NoteIcon />;
  }
}

export function ArtifactListView({ projectId, variant = "compact" }: ArtifactListViewProps) {
  const { t, locale } = useTranslation();
  const artifactsVersion = useAgentStore((state) => state.artifactsVersion);
  const openArtifactPanel = useAgentStore((state) => state.openArtifactPanel);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setArtifacts([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void listArtifacts(projectId).then((rows) => {
      if (!cancelled) {
        setArtifacts(rows);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, artifactsVersion]);

  const handleOpen = useCallback(
    (artifact: Artifact) => {
      openArtifactPanel(artifact.id);
    },
    [openArtifactPanel],
  );

  const handleDelete = useCallback(
    async (event: React.MouseEvent, artifact: Artifact) => {
      event.stopPropagation();
      await deleteArtifact(artifact.id);
      setArtifacts((current) => current.filter((entry) => entry.id !== artifact.id));
    },
    [],
  );

  const isFull = variant === "full";

  return (
    <section
      aria-label={t("agent.artifact.sectionTitle")}
      className={isFull ? "" : "shrink-0 border-b border-[var(--rb-border)] bg-[var(--rb-card-bg)]"}
    >
      {isFull ? (
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-[var(--rb-text-primary)]">
            {t("nav.chatBoxArtifacts")}
          </h1>
        </header>
      ) : (
        <div className="flex items-center justify-between px-3 py-2 sm:px-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--rb-text-secondary)]">
            {t("agent.artifact.sectionTitle")}
          </h3>
          {!loading && artifacts.length > 0 ? (
            <span className="text-[10px] text-[var(--rb-text-secondary)]">
              {artifacts.length}
            </span>
          ) : null}
        </div>
      )}

      <div className={isFull ? "" : "max-h-36 overflow-y-auto px-2 pb-2 sm:px-3"}>
        {loading ? (
          <p className="px-1 py-2 text-xs text-[var(--rb-text-secondary)]">
            {t("agent.artifact.loading")}
          </p>
        ) : artifacts.length === 0 ? (
          <p className="px-1 py-2 text-sm text-[var(--rb-text-secondary)]">
            {t("agent.artifact.empty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {artifacts.map((artifact) => (
              <li key={artifact.id}>
                <div className="group flex items-center gap-1 rounded-lg border border-transparent hover:border-[var(--rb-border)] hover:bg-[color-mix(in_srgb,var(--rb-border)_30%,transparent)]">
                  <button
                    type="button"
                    onClick={() => handleOpen(artifact)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--rb-primary)_10%,transparent)] text-[var(--rb-primary)]">
                      <ArtifactKindIcon kind={artifact.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--rb-text-primary)]">
                        {artifact.title}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--rb-text-secondary)]">
                        {formatArtifactDate(artifact.updatedAt, locale)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void handleDelete(event, artifact)}
                    aria-label={t("agent.artifact.delete", { title: artifact.title })}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--rb-text-secondary)] opacity-0 transition-opacity hover:bg-[color-mix(in_srgb,red_12%,transparent)] hover:text-red-600 group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export type ArtifactListProps = ArtifactListViewProps;

export function ArtifactList(props: ArtifactListViewProps) {
  return <ArtifactListView {...props} />;
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" />
      <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="3" y1="9" x2="21" y2="9" strokeLinecap="round" />
      <line x1="3" y1="15" x2="21" y2="15" strokeLinecap="round" />
      <line x1="9" y1="3" x2="9" y2="21" strokeLinecap="round" />
    </svg>
  );
}

function OutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
      <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
      <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="13" x2="16" y2="13" strokeLinecap="round" />
      <line x1="8" y1="17" x2="13" y2="17" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
