import { deriveSidebarText, type ColorPalette } from "@/core/colorPalette";
import { useTranslation } from "@/i18n";

/**
 * 用 inline style 直接注入「正在编辑」的配色，仅作用于本预览，不写 :root。
 */
export function ColorPalettePreview({ palette }: { palette: ColorPalette }) {
  const { t } = useTranslation();
  const sidebar = deriveSidebarText(palette.sidebarBg);

  return (
    <div
      className="flex overflow-hidden rounded-lg border text-sm"
      style={{ borderColor: palette.border }}
    >
      <div
        className="w-32 shrink-0 space-y-1 p-3"
        style={{ backgroundColor: palette.sidebarBg, color: sidebar.text }}
      >
        <div
          className="rounded px-2 py-1 text-xs font-medium"
          style={{ backgroundColor: palette.sidebarActive, color: sidebar.text }}
        >
          {t("settings.colorPalette.previewActive")}
        </div>
        <div className="px-2 py-1 text-xs" style={{ color: sidebar.muted }}>
          {t("settings.colorPalette.previewItem")}
        </div>
        <div className="px-2 py-1 text-xs" style={{ color: sidebar.muted }}>
          {t("settings.colorPalette.previewItem")}
        </div>
      </div>

      <div className="flex-1 p-4" style={{ backgroundColor: palette.pageBg }}>
        <div
          className="rounded-lg border p-3 shadow-sm"
          style={{ backgroundColor: palette.cardBg, borderColor: palette.border }}
        >
          <h4
            className="text-sm font-semibold"
            style={{ color: palette.textPrimary }}
          >
            {t("settings.colorPalette.previewCardTitle")}
          </h4>
          <p className="mt-1 text-xs" style={{ color: palette.textSecondary }}>
            {t("settings.colorPalette.previewBody")}
          </p>
          <p
            className="mt-2 text-xs font-medium"
            style={{ color: palette.translation }}
          >
            {t("settings.colorPalette.previewTranslation")}
          </p>
          <button
            type="button"
            disabled
            className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: palette.primary }}
          >
            {t("settings.colorPalette.previewButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
