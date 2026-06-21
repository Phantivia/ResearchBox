import type { ViewMode } from "@/store";
import { useTranslation } from "@/i18n";

export interface ViewModeSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const VIEW_MODE_VALUES = ["original", "translation", "bilingual"] as const satisfies readonly ViewMode[];

export function ViewModeSwitcher({ value, onChange }: ViewModeSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[var(--rb-border)] bg-[var(--rb-page-bg)] p-1"
      role="group"
      aria-label={t("viewMode.ariaLabel")}
    >
      {VIEW_MODE_VALUES.map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--rb-card-bg)] text-[var(--rb-primary)] shadow-sm"
                : "text-[var(--rb-text-secondary)] hover:text-[var(--rb-text-primary)]"
            }`}
          >
            {t(`viewMode.${mode}`)}
          </button>
        );
      })}
    </div>
  );
}
