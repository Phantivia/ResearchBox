import { useEffect } from "react";
import { useSettingsStore } from "@/store/settingsStore";

export function LocaleSync() {
  const uiLocale = useSettingsStore((state) => state.uiLocale);
  const loaded = useSettingsStore((state) => state.loaded);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    document.documentElement.lang = uiLocale === "zh" ? "zh-CN" : "en";
  }, [loaded, uiLocale]);

  return null;
}
