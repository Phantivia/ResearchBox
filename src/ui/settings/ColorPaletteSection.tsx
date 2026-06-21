import { useEffect, useState } from "react";
import {
  CUSTOM_PALETTE_ID,
  DEFAULT_PALETTE,
  PRESET_PALETTES,
  type ColorPalette,
  type SavedPalette,
} from "@/core/colorPalette";
import type { MessageKey } from "@/core/i18n";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/store";
import { SETTINGS_SECTION_IDS } from "./sections";
import { ColorPalettePreview } from "./ColorPalettePreview";

const TOKEN_ORDER: readonly (keyof ColorPalette)[] = [
  "sidebarBg",
  "sidebarActive",
  "primary",
  "primaryHover",
  "pageBg",
  "cardBg",
  "textPrimary",
  "textSecondary",
  "border",
  "translation",
];

// 预设/方案缩略图取这几个 token 作小色块。
const SWATCH_TOKENS: readonly (keyof ColorPalette)[] = [
  "sidebarBg",
  "primary",
  "pageBg",
  "cardBg",
  "translation",
];

function presetLabel(
  entry: SavedPalette,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  return entry.builtIn
    ? t(`settings.colorPalette.preset.${entry.id}` as MessageKey)
    : entry.name;
}

function Swatches({ palette }: { palette: ColorPalette }) {
  return (
    <div className="flex gap-1">
      {SWATCH_TOKENS.map((token) => (
        <span
          key={token}
          className="h-4 w-4 rounded-full border border-black/10"
          style={{ backgroundColor: palette[token] }}
        />
      ))}
    </div>
  );
}

export function ColorPaletteSection() {
  const { t } = useTranslation();
  const loaded = useSettingsStore((state) => state.loaded);
  const activePaletteId = useSettingsStore((state) => state.activePaletteId);
  const savedPalettes = useSettingsStore((state) => state.savedPalettes);
  const getEffectivePalette = useSettingsStore(
    (state) => state.getEffectivePalette,
  );
  const setActivePaletteId = useSettingsStore(
    (state) => state.setActivePaletteId,
  );
  const setCustomPalette = useSettingsStore((state) => state.setCustomPalette);
  const savePalette = useSettingsStore((state) => state.savePalette);
  const deleteSavedPalette = useSettingsStore(
    (state) => state.deleteSavedPalette,
  );

  // draft 是「正在编辑」的配色：驱动实时预览与颜色输入，点「应用」前不写 :root。
  const [draft, setDraft] = useState<ColorPalette>(DEFAULT_PALETTE);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    setDraft(getEffectivePalette());
    setSelectedPresetId(activePaletteId);
  }, [loaded, activePaletteId, getEffectivePalette]);

  const presets: SavedPalette[] = [...PRESET_PALETTES, ...savedPalettes];

  function selectPreset(entry: SavedPalette) {
    setDraft(entry.palette);
    setSelectedPresetId(entry.id);
    setMessage(null);
  }

  function editToken(token: keyof ColorPalette, value: string) {
    setDraft((current) => ({ ...current, [token]: value }));
    setSelectedPresetId(CUSTOM_PALETTE_ID);
    setMessage(null);
  }

  async function handleApply() {
    if (selectedPresetId && selectedPresetId !== CUSTOM_PALETTE_ID) {
      await setActivePaletteId(selectedPresetId);
    } else {
      await setCustomPalette(draft);
    }
    setMessage(t("settings.colorPalette.applied"));
  }

  async function handleReset() {
    setDraft(DEFAULT_PALETTE);
    setSelectedPresetId("default");
    await setActivePaletteId("default");
    setMessage(t("settings.colorPalette.applied"));
  }

  async function handleSaveAs() {
    const name = window.prompt(t("settings.colorPalette.savePrompt"));
    if (!name?.trim()) {
      return;
    }
    const entry = await savePalette(name.trim(), draft);
    setSelectedPresetId(entry.id);
    setMessage(t("settings.colorPalette.savedDone"));
  }

  async function handleDelete(entry: SavedPalette) {
    if (!window.confirm(t("settings.colorPalette.deleteConfirm", { name: entry.name }))) {
      return;
    }
    await deleteSavedPalette(entry.id);
  }

  return (
    <section
      id={SETTINGS_SECTION_IDS.colorPalette}
      className="scroll-mt-4 mt-8 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
    >
      <h2 className="mb-1 text-lg font-semibold text-[var(--rb-text-primary)]">
        {t("settings.colorPalette")}
      </h2>
      <p className="mb-4 text-sm text-[var(--rb-text-secondary)]">
        {t("settings.colorPalette.hint")}
      </p>

      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-[var(--rb-text-primary)]">
            {t("settings.colorPalette.presets")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {presets.map((entry) => {
              const active = selectedPresetId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    active
                      ? "border-[var(--rb-primary)] ring-2 ring-[var(--rb-primary)]/30"
                      : "border-[var(--rb-border)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectPreset(entry)}
                    className="flex items-center gap-2"
                  >
                    <Swatches palette={entry.palette} />
                    <span className="text-sm text-[var(--rb-text-primary)]">
                      {presetLabel(entry, t)}
                    </span>
                  </button>
                  {!entry.builtIn && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(entry)}
                      className="text-xs text-red-600 hover:underline"
                      aria-label={t("settings.colorPalette.delete")}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-[var(--rb-text-primary)]">
            {t("settings.colorPalette.custom")}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TOKEN_ORDER.map((token) => (
              <label
                key={token}
                className="flex items-center gap-3 rounded-lg border border-[var(--rb-border)] px-3 py-2"
              >
                <input
                  type="color"
                  value={draft[token]}
                  onChange={(event) => editToken(token, event.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded border border-[var(--rb-border)] bg-transparent"
                  aria-label={t(`settings.colorPalette.token.${token}` as MessageKey)}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--rb-text-primary)]">
                  {t(`settings.colorPalette.token.${token}` as MessageKey)}
                </span>
                <span className="font-mono text-xs text-[var(--rb-text-secondary)]">
                  {draft[token]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleApply()}
            className="rounded-lg bg-[var(--rb-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--rb-primary-hover)]"
          >
            {t("settings.colorPalette.apply")}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAs()}
            className="rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-4 py-2 text-sm font-medium text-[var(--rb-text-primary)] hover:bg-[var(--rb-page-bg)]"
          >
            {t("settings.colorPalette.saveAs")}
          </button>
          <button
            type="button"
            onClick={() => void handleReset()}
            className="rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-4 py-2 text-sm font-medium text-[var(--rb-text-primary)] hover:bg-[var(--rb-page-bg)]"
          >
            {t("settings.colorPalette.reset")}
          </button>
          {message && (
            <p className="self-center text-sm text-green-700" role="status">
              {message}
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-[var(--rb-text-primary)]">
            {t("settings.colorPalette.preview")}
          </h3>
          <ColorPalettePreview palette={draft} />
        </div>
      </div>
    </section>
  );
}
