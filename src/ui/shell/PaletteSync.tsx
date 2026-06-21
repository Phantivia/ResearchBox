import { useEffect } from "react";
import { applyPalette, resolvePalette } from "@/core/colorPalette";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * 启动时加载 settings 并把生效配色注入 :root；activePaletteId / customPalette /
 * savedPalettes 变化时实时重应用，实现全站换肤。
 */
export function PaletteSync() {
  const loaded = useSettingsStore((state) => state.loaded);
  const load = useSettingsStore((state) => state.load);
  const activePaletteId = useSettingsStore((state) => state.activePaletteId);
  const customPalette = useSettingsStore((state) => state.customPalette);
  const savedPalettes = useSettingsStore((state) => state.savedPalettes);

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    applyPalette(resolvePalette(activePaletteId, customPalette, savedPalettes));
  }, [loaded, activePaletteId, customPalette, savedPalettes]);

  return null;
}
