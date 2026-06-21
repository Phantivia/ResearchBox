import type { UiLocale } from "@/core/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { useTranslation } from "./useTranslation";

type LanguageSwitcherProps = {
  compact?: boolean;
  variant?: "light" | "dark";
};

const LOCALE_OPTIONS: UiLocale[] = ["zh", "en"];

export function LanguageSwitcher({
  compact = false,
  variant = "light",
}: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const uiLocale = useSettingsStore((state) => state.uiLocale);
  const setUiLocale = useSettingsStore((state) => state.setUiLocale);

  const labelClass =
    variant === "dark" ? "text-gray-300" : "text-gray-700";
  const selectClass =
    variant === "dark"
      ? "border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-400 focus:ring-blue-500/30"
      : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-200";

  if (compact) {
    return (
      <div className="flex rounded-lg bg-gray-800 p-0.5">
        {LOCALE_OPTIONS.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => void setUiLocale(locale)}
            aria-pressed={uiLocale === locale}
            className={[
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              uiLocale === locale
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200",
            ].join(" ")}
          >
            {t(`locale.${locale}` as "locale.zh" | "locale.en")}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className="block">
      <span className={`mb-1 block text-sm font-medium ${labelClass}`}>
        {t("locale.label")}
      </span>
      <select
        value={uiLocale}
        onChange={(event) => void setUiLocale(event.target.value as UiLocale)}
        className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 ${selectClass}`}
      >
        {LOCALE_OPTIONS.map((locale) => (
          <option key={locale} value={locale}>
            {t(`locale.${locale}` as "locale.zh" | "locale.en")}
          </option>
        ))}
      </select>
    </label>
  );
}
