import type { Provenance } from "@/core/agent/provenance";
import { useTranslation } from "@/i18n";

const PROVENANCE_STYLES: Record<
  Provenance,
  { bg: string; text: string; ring: string }
> = {
  paperbox: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-800",
  },
  academic: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-800 dark:text-blue-300",
    ring: "ring-blue-200 dark:ring-blue-800",
  },
  web: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    ring: "ring-amber-200 dark:ring-amber-800",
  },
};

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
    <span
      className={[
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        styles.bg,
        styles.text,
        styles.ring,
        className,
      ].join(" ")}
    >
      {t(PROVENANCE_I18N[provenance])}
    </span>
  );
}
