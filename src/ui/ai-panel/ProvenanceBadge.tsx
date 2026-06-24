import type { Provenance } from "@/core/agent/provenance";
import { useTranslation } from "@/i18n";

const PROVENANCE_STYLES: Record<Provenance, { dot: string; border: string }> = {
  paperbox: {
    dot: "bg-[color-mix(in_srgb,#059669_45%,var(--rb-text-secondary))]",
    border: "border-[color-mix(in_srgb,#059669_30%,var(--rb-border))]",
  },
  academic: {
    dot: "bg-[color-mix(in_srgb,var(--rb-primary)_65%,var(--rb-text-secondary))]",
    border: "border-[color-mix(in_srgb,var(--rb-primary)_38%,var(--rb-border))]",
  },
  web: {
    dot: "bg-[color-mix(in_srgb,#b45309_40%,var(--rb-text-secondary))]",
    border: "border-[color-mix(in_srgb,#b45309_28%,var(--rb-border))]",
  },
};

const BADGE_BASE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-[color-mix(in_srgb,var(--rb-border)_28%,var(--rb-page-bg))] px-2 py-0.5 text-[11px] font-medium tracking-wide text-[var(--rb-text-secondary)]";

const PROVENANCE_I18N = {
  paperbox: "agent.provenance.paperbox",
  academic: "agent.provenance.academic",
  web: "agent.provenance.web",
} as const satisfies Record<Provenance, string>;

export interface ProvenanceBadgeProps {
  provenance: Provenance;
  className?: string;
}

export function ProvenanceBadge({ provenance, className = "" }: ProvenanceBadgeProps) {
  const { t } = useTranslation();
  const styles = PROVENANCE_STYLES[provenance];

  return (
    <span className={[BADGE_BASE, styles.border, className].join(" ")}>
      <span
        className={["h-1.5 w-1.5 shrink-0 rounded-full", styles.dot].join(" ")}
        aria-hidden
      />
      {t(PROVENANCE_I18N[provenance])}
    </span>
  );
}
