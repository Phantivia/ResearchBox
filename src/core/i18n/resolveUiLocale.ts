import { DEFAULT_UI_LOCALE, type UiLocale } from "./schema";

function bcp47TagToUiLocale(tag: string): UiLocale | null {
  const normalized = tag.trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  if (normalized === "zh" || normalized.startsWith("zh-")) {
    return "zh";
  }
  return null;
}

/** Pick the first supported UI locale from BCP 47 tags; fallback to English. */
export function resolveUiLocaleFromLanguages(
  languages: readonly string[],
): UiLocale {
  for (const language of languages) {
    const locale = bcp47TagToUiLocale(language);
    if (locale) {
      return locale;
    }
  }
  return DEFAULT_UI_LOCALE;
}
