import { useTranslation } from "@/i18n";
import { useProjectStore } from "@/store";

export function CurrentProjectLabel() {
  const { t } = useTranslation();
  const activeProject = useProjectStore((state) => state.getActiveProject());

  return (
    <p className="mb-1 text-sm text-[var(--rb-text-secondary)]">
      {t("feature.currentProjectPrefix")}
      <span className="font-semibold text-[var(--rb-text-primary)]">
        {activeProject?.name ?? t("nav.noActiveProject")}
      </span>
    </p>
  );
}
