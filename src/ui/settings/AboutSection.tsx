import { BRAND_CREDITS } from "@/core/brand";
import { useTranslation } from "@/i18n";
import { BrandCreditsTrigger } from "@/ui/brand/BrandCreditsTrigger";
import { MiniLogo } from "@/ui/brand/MiniLogo";

export function AboutSection() {
  const { t } = useTranslation();

  return (
    <section
      id="settings-about"
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-gray-900">{t("settings.about")}</h2>
      <div className="mt-4 flex items-start gap-4">
        <BrandCreditsTrigger className="shrink-0 rounded-lg p-1 transition-colors hover:bg-gray-100">
          <MiniLogo className="h-10 w-10 text-[var(--rb-primary)]" />
        </BrandCreditsTrigger>
        <div className="min-w-0 space-y-3 text-sm">
          <p className="font-medium text-gray-900">{t("brand.tagline")}</p>
          <dl className="space-y-2">
            <div>
              <dt className="text-gray-500">{t("brand.author")}</dt>
              <dd className="font-medium text-gray-900">{BRAND_CREDITS.author}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t("brand.contact")}</dt>
              <dd>
                <a
                  href={`mailto:${BRAND_CREDITS.contactEmail}`}
                  className="font-medium text-[var(--rb-primary)] hover:underline"
                >
                  {BRAND_CREDITS.contactEmail}
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
