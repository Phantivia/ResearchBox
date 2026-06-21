import { useTranslation } from "@/i18n";
import { CurrentProjectLabel } from "@/ui/shell/CurrentProjectLabel";
import { FeatureIcon } from "@/ui/shell/featureIcons";

export function Dummy() {
  const { t } = useTranslation();

  return (
    <main className="relative z-10 min-h-screen overflow-x-clip">
      <div className="mx-auto min-w-0 max-w-3xl px-4 py-10">
        <header className="mb-6">
          <CurrentProjectLabel />
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-[var(--rb-border)] bg-[var(--rb-card-bg)] text-[var(--rb-text-secondary)]">
              <FeatureIcon id="dummy" className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-[var(--rb-text-primary)]">{t("dummy.title")}</h1>
              <p className="mt-1 text-sm text-[var(--rb-text-secondary)]">{t("dummy.subtitle")}</p>
            </div>
          </div>
        </header>

        <section className="rounded-sm border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-6 py-10 text-center shadow-sm">
          <p className="text-sm text-[var(--rb-text-secondary)]">{t("dummy.placeholder")}</p>
        </section>
      </div>
    </main>
  );
}
