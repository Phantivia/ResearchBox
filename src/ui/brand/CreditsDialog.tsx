import { useEffect } from "react";
import { BRAND_CREDITS } from "@/core/brand";
import { useTranslation } from "@/i18n";
import { Logo } from "./Logo";

interface CreditsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreditsDialog({ open, onClose }: CreditsDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("common.cancel")}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-dialog-title"
        className="relative z-10 w-full max-w-sm rounded-xl border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-xl"
      >
        <Logo className="mx-auto h-16 w-full max-w-[220px] text-[var(--rb-primary)]" />
        <h2
          id="credits-dialog-title"
          className="mt-4 text-center text-lg font-semibold text-[var(--rb-text-primary)]"
        >
          ResearchBox
        </h2>
        <p className="mt-1 text-center text-sm text-[var(--rb-text-secondary)]">
          {t("brand.tagline")}
        </p>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[var(--rb-text-secondary)]">{t("brand.author")}</dt>
            <dd className="font-medium text-[var(--rb-text-primary)]">
              {BRAND_CREDITS.author}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[var(--rb-text-secondary)]">{t("brand.contact")}</dt>
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
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-[var(--rb-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {t("brand.close")}
        </button>
      </div>
    </div>
  );
}
