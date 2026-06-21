import { resolveUiLocaleFromLanguages } from "./resolveUiLocale";
import { DEFAULT_UI_LOCALE, type UiLocale } from "./schema";

export const UI_LOCALE_STORAGE_KEY = "researchbox:uiLocale";

/** BCP 47 tag for `<html lang>` — must match the document's primary UI language. */
export function uiLocaleToHtmlLang(locale: UiLocale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

export function htmlLangToUiLocale(lang: string | null | undefined): UiLocale {
  if (!lang) {
    return DEFAULT_UI_LOCALE;
  }
  return resolveUiLocaleFromLanguages([lang]);
}
