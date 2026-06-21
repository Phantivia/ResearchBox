import { BRAND_CREDITS } from "@/core/brand";
import { useTranslation } from "@/i18n";
import { BrandCreditsTrigger } from "@/ui/brand/BrandCreditsTrigger";

export function PageFooter() {
  const { t } = useTranslation();

  return (
    <footer className="relative z-10 border-t border-[var(--rb-border)]/60 px-4 py-4">
      <div className="mx-auto flex max-w-3xl justify-center">
        <BrandCreditsTrigger className="text-center text-xs text-[var(--rb-text-secondary)] transition-colors hover:text-[var(--rb-text-primary)]">
          <span>{t("brand.tagline")}</span>
          <span className="mx-1.5 text-[var(--rb-border)]">·</span>
          <span>{BRAND_CREDITS.author}</span>
        </BrandCreditsTrigger>
      </div>
    </footer>
  );
}
