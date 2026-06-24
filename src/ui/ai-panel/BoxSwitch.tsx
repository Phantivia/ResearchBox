import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

export interface BoxSwitchProps {
  className?: string;
}

export function BoxSwitch({ className = "" }: BoxSwitchProps) {
  const { t } = useTranslation();
  const boxOpen = useAgentStore((state) => state.boxOpen);
  const openBox = useAgentStore((state) => state.openBox);
  const closeBox = useAgentStore((state) => state.closeBox);

  const activeDesc = boxOpen ? t("agent.box.collectingDesc") : t("agent.box.researchingDesc");

  return (
    <div className={`px-4 py-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-[var(--rb-text-secondary)]">
          {t("agent.box.label")}
        </span>
        <div
          className="inline-flex rounded-sm border border-[var(--rb-border)] p-0.5"
          role="radiogroup"
          aria-label={t("agent.box.label")}
        >
          <button
            type="button"
            role="radio"
            aria-checked={boxOpen}
            onClick={() => {
              if (!boxOpen) {
                openBox();
              }
            }}
            className={[
              "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--rb-primary)]",
              boxOpen
                ? "bg-emerald-600 text-white"
                : "text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_40%,var(--rb-page-bg))] hover:text-[var(--rb-text-primary)]",
            ].join(" ")}
          >
            {t("agent.box.collecting")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!boxOpen}
            onClick={() => {
              if (boxOpen) {
                closeBox();
              }
            }}
            className={[
              "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--rb-primary)]",
              !boxOpen
                ? "bg-indigo-600 text-white"
                : "text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_40%,var(--rb-page-bg))] hover:text-[var(--rb-text-primary)]",
            ].join(" ")}
          >
            {t("agent.box.researching")}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--rb-text-secondary)]">{activeDesc}</p>
    </div>
  );
}
