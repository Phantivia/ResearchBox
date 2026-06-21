import { Link } from "react-router-dom";
import { useTranslation } from "@/i18n";
import { BrandCreditsTrigger, MiniLogo } from "@/ui/brand";

export function NoProject() {
  const { t } = useTranslation();

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center overflow-x-clip px-4">
      <div className="min-w-0 max-w-md rounded-lg border border-dashed border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-6 py-12 text-center">
        <BrandCreditsTrigger className="mx-auto mb-4 block rounded-lg transition-opacity hover:opacity-80">
          <MiniLogo
            className="mx-auto h-12 w-12 text-[var(--rb-primary)]"
            aria-hidden
          />
        </BrandCreditsTrigger>
        <h1 className="text-lg font-semibold text-[var(--rb-text-primary)]">
          {t("noProject.title")}
        </h1>
        <p className="mt-2 text-sm text-[var(--rb-text-secondary)]">{t("noProject.body")}</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg bg-[var(--rb-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[var(--rb-primary-hover)]"
        >
          {t("noProject.cta")}
        </Link>
      </div>
    </main>
  );
}
