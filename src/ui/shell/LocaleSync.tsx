import { useEffect } from "react";
import { uiLocaleToHtmlLang, UI_LOCALE_STORAGE_KEY } from "@/core/i18n";
import { useSettingsStore } from "@/store/settingsStore";

function syncDocumentLang(uiLocale: Parameters<typeof uiLocaleToHtmlLang>[0]): void {
  document.documentElement.lang = uiLocaleToHtmlLang(uiLocale);
  try {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, uiLocale);
  } catch {
    /* localStorage may be unavailable in private mode */
  }
}

export function LocaleSync() {
  const uiLocale = useSettingsStore((state) => state.uiLocale);

  useEffect(() => {
    syncDocumentLang(uiLocale);
  }, [uiLocale]);

  return null;
}
