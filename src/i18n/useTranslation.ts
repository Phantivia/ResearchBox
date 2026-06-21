import { useCallback } from "react";
import { translate, type MessageKey } from "@/core/i18n";
import { useSettingsStore } from "@/store/settingsStore";

export function useTranslation() {
  const uiLocale = useSettingsStore((state) => state.uiLocale);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) =>
      translate(uiLocale, key, params),
    [uiLocale],
  );

  return {
    locale: uiLocale,
    t,
  };
}
