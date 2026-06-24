import type { ArtifactKind } from "@/core/agent/artifact/schema";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

export interface ArtifactCardProps {
  artifactId: string;
  title: string;
  kind: ArtifactKind;
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

export function ArtifactCard({ artifactId, title, kind }: ArtifactCardProps) {
  const { t } = useTranslation();
  const openArtifactPanel = useAgentStore((state) => state.openArtifactPanel);

  return (
    <button
      type="button"
      onClick={() => openArtifactPanel(artifactId)}
      className="flex w-full items-center gap-3 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-3 py-2.5 text-left shadow-sm transition-colors hover:border-[color-mix(in_srgb,var(--rb-primary)_35%,var(--rb-border))] hover:bg-[color-mix(in_srgb,var(--rb-primary)_6%,var(--rb-card-bg))]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--rb-primary)_12%,transparent)] text-[var(--rb-primary)]">
        <ArtifactKindIcon kind={kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--rb-text-primary)]">
          {title}
        </span>
        <span className="block truncate text-[11px] text-[var(--rb-text-secondary)]">
          {t(`agent.artifact.kind.${kind}`)}
        </span>
      </span>
      <ChevronIcon />
    </button>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-[var(--rb-text-secondary)]"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
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
