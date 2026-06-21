import { create } from "zustand";
import { UI_LOCALE_STORAGE_KEY, type UiLocale } from "@/core/i18n";
import type { ProviderConfig } from "@/core/llm";
import {
  applyPalette,
  resolvePalette,
  CUSTOM_PALETTE_ID,
  type ColorPalette,
  type SavedPalette,
} from "@/core/colorPalette";
import {
  deletePalette,
  deleteProviderConfig,
  getSettings,
  listPalettes,
  listProviderConfigs,
  putPalette,
  saveProviderConfig,
  saveSettings,
  type AppSettings,
  type ViewMode,
} from "@/db";

interface SettingsState {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  viewMode: ViewMode;
  targetLang: string;
  debugMode: boolean;
  uiLocale: UiLocale;
  activePaletteId: string | null;
  customPalette: ColorPalette | null;
  savedPalettes: SavedPalette[];
  loaded: boolean;
}

interface SettingsActions {
  load: () => Promise<void>;
  saveProvider: (config: ProviderConfig) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setActiveProviderId: (id: string | null) => Promise<void>;
  setViewMode: (mode: ViewMode) => Promise<void>;
  setTargetLang: (lang: string) => Promise<void>;
  setDebugMode: (enabled: boolean) => Promise<void>;
  setUiLocale: (locale: UiLocale) => Promise<void>;
  setActivePaletteId: (id: string) => Promise<void>;
  setCustomPalette: (palette: ColorPalette) => Promise<void>;
  savePalette: (name: string, palette: ColorPalette) => Promise<SavedPalette>;
  deleteSavedPalette: (id: string) => Promise<void>;
  loadPalettes: () => Promise<void>;
  getEffectivePalette: () => ColorPalette;
  getActiveProvider: () => ProviderConfig | undefined;
  hasActiveProvider: () => boolean;
}

function mirrorUiLocaleStorage(uiLocale: UiLocale): void {
  try {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, uiLocale);
  } catch {
    /* localStorage may be unavailable in private mode */
  }
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  (set, get) => ({
    providers: [],
    activeProviderId: null,
    viewMode: "original",
    targetLang: "zh",
    debugMode: false,
    uiLocale: "zh",
    activePaletteId: "default",
    customPalette: null,
    savedPalettes: [],
    loaded: false,

    load: async () => {
      const [providers, settings, savedPalettes] = await Promise.all([
        listProviderConfigs(),
        getSettings(),
        listPalettes(),
      ]);
      set({
        providers,
        activeProviderId: settings.activeProviderId,
        viewMode: settings.viewMode,
        targetLang: settings.targetLang,
        debugMode: settings.debugMode,
        uiLocale: settings.uiLocale,
        activePaletteId: settings.activePaletteId,
        customPalette: settings.customPalette,
        savedPalettes,
        loaded: true,
      });
      mirrorUiLocaleStorage(settings.uiLocale);
    },

    saveProvider: async (config) => {
      await saveProviderConfig(config);
      const providers = await listProviderConfigs();
      set({ providers });
    },

    deleteProvider: async (id) => {
      await deleteProviderConfig(id);
      const providers = await listProviderConfigs();
      set({ providers });

      if (get().activeProviderId === id) {
        const settings = await saveSettings({ activeProviderId: null });
        set({ activeProviderId: settings.activeProviderId });
      }
    },

    setActiveProviderId: async (id) => {
      const settings = await saveSettings({ activeProviderId: id });
      set({ activeProviderId: settings.activeProviderId });
    },

    setViewMode: async (mode) => {
      const settings = await saveSettings({ viewMode: mode });
      set({ viewMode: settings.viewMode });
    },

    setTargetLang: async (lang) => {
      const settings = await saveSettings({ targetLang: lang });
      set({ targetLang: settings.targetLang });
    },

    setDebugMode: async (enabled) => {
      const settings = await saveSettings({ debugMode: enabled });
      set({ debugMode: settings.debugMode });
    },

    setUiLocale: async (locale) => {
      const settings = await saveSettings({ uiLocale: locale });
      set({ uiLocale: settings.uiLocale });
      mirrorUiLocaleStorage(settings.uiLocale);
    },

    setActivePaletteId: async (id) => {
      const settings = await saveSettings({ activePaletteId: id });
      set({ activePaletteId: settings.activePaletteId });
      applyPalette(get().getEffectivePalette());
    },

    setCustomPalette: async (palette) => {
      const settings = await saveSettings({
        customPalette: palette,
        activePaletteId: CUSTOM_PALETTE_ID,
      });
      set({
        customPalette: settings.customPalette,
        activePaletteId: settings.activePaletteId,
      });
      applyPalette(get().getEffectivePalette());
    },

    savePalette: async (name, palette) => {
      const entry: SavedPalette = {
        id: `palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        palette,
        builtIn: false,
        createdAt: Date.now(),
      };
      await putPalette(entry);
      set({ savedPalettes: await listPalettes() });
      return entry;
    },

    deleteSavedPalette: async (id) => {
      await deletePalette(id);
      const savedPalettes = await listPalettes();
      set({ savedPalettes });
      if (get().activePaletteId === id) {
        const settings = await saveSettings({ activePaletteId: "default" });
        set({ activePaletteId: settings.activePaletteId });
        applyPalette(get().getEffectivePalette());
      }
    },

    loadPalettes: async () => {
      set({ savedPalettes: await listPalettes() });
    },

    getEffectivePalette: () => {
      const { activePaletteId, customPalette, savedPalettes } = get();
      return resolvePalette(activePaletteId, customPalette, savedPalettes);
    },

    getActiveProvider: () => {
      const { providers, activeProviderId } = get();
      if (!activeProviderId) {
        return undefined;
      }
      return providers.find((provider) => provider.id === activeProviderId);
    },

    hasActiveProvider: () => {
      const provider = get().getActiveProvider();
      return Boolean(
        provider?.apiKey.trim() && provider.baseURL.trim() && provider.model.trim(),
      );
    },
  }),
);

export type { AppSettings, ViewMode };
