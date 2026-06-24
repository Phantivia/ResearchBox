import type { MessageKey } from "@/core/i18n";

export const SETTINGS_SECTION_IDS = {
  llmProvider: "settings-llm-provider",
  savedProviders: "settings-saved-providers",
  academicSearch: "settings-academic-search",
  agentCapabilities: "settings-agent-capabilities",
  readingPrefs: "settings-reading-prefs",
  colorPalette: "settings-color-palette",
  dataManagement: "settings-data-management",
} as const;

export type SettingsSectionId =
  (typeof SETTINGS_SECTION_IDS)[keyof typeof SETTINGS_SECTION_IDS];

export interface SettingsSectionNavItem {
  id: SettingsSectionId;
  labelKey: MessageKey;
  requiresSavedProviders?: boolean;
}

export const SETTINGS_SECTION_NAV: readonly SettingsSectionNavItem[] = [
  { id: SETTINGS_SECTION_IDS.llmProvider, labelKey: "settings.llmProvider" },
  {
    id: SETTINGS_SECTION_IDS.savedProviders,
    labelKey: "settings.savedProviders",
    requiresSavedProviders: true,
  },
  { id: SETTINGS_SECTION_IDS.academicSearch, labelKey: "settings.academicSearch" },
  { id: SETTINGS_SECTION_IDS.agentCapabilities, labelKey: "settings.agentCapabilities" },
  { id: SETTINGS_SECTION_IDS.readingPrefs, labelKey: "settings.readingPrefs" },
  { id: SETTINGS_SECTION_IDS.colorPalette, labelKey: "settings.colorPalette" },
  { id: SETTINGS_SECTION_IDS.dataManagement, labelKey: "settings.dataManagement" },
];

export function scrollToSettingsSection(id: SettingsSectionId): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
