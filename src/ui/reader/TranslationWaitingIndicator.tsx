import { useTranslation } from "@/i18n";

type TranslationWaitingIndicatorProps = {
  variant?: "block" | "inline";
  className?: string;
};

export function TranslationWaitingIndicator({
  variant = "block",
  className = "",
}: TranslationWaitingIndicatorProps) {
  const { t } = useTranslation();
  const label = t("reader.translation.waitingForLlm");

  if (variant === "inline") {
    return (
      <span
        className={`mx-0.5 inline-flex items-center gap-1.5 align-middle text-xs text-[var(--rb-text-secondary)] ${className}`}
        aria-label={label}
        data-testid="translation-placeholder"
      >
        <span
          className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--rb-primary)]"
          aria-hidden
        />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 text-sm text-[var(--rb-text-secondary)] ${className}`}
      aria-label={label}
      data-testid="translation-placeholder"
    >
      <span
        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--rb-primary)]"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}
