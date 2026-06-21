import { z } from "zod";

// Hex color (#rgb / #rrggbb). Kept liberal: <input type="color"> always emits #rrggbb,
// but presets may use shorthand and we don't want to reject hand-authored values.
const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex color like #1e40af");

/**
 * ColorPalette — 10 个语义颜色 token。功能色（错误红/成功绿/警告琥珀）不纳入，
 * 保持硬编码以确保信息传达的可辨识性。侧边栏文字色不在此处：由背景亮度自动推导
 * （见 deriveSidebarText），用户无需手动维护对比度。
 */
export const ColorPaletteSchema = z.object({
  sidebarBg: HexColorSchema,
  sidebarActive: HexColorSchema,
  primary: HexColorSchema,
  primaryHover: HexColorSchema,
  pageBg: HexColorSchema,
  cardBg: HexColorSchema,
  textPrimary: HexColorSchema,
  textSecondary: HexColorSchema,
  border: HexColorSchema,
  translation: HexColorSchema,
});

export type ColorPalette = z.infer<typeof ColorPaletteSchema>;

export const SavedPaletteSchema = z.object({
  id: z.string(),
  name: z.string(),
  palette: ColorPaletteSchema,
  builtIn: z.boolean(),
  createdAt: z.number(),
});

export type SavedPalette = z.infer<typeof SavedPaletteSchema>;

/**
 * token → CSS 变量名映射。是「颜色 token」与「:root 变量」之间的唯一事实来源；
 * UI 通过 var(--rb-*) 消费，运行时改写 :root 即换肤。
 */
export const PALETTE_CSS_VARS = {
  sidebarBg: "--rb-sidebar-bg",
  sidebarActive: "--rb-sidebar-active",
  primary: "--rb-primary",
  primaryHover: "--rb-primary-hover",
  pageBg: "--rb-page-bg",
  cardBg: "--rb-card-bg",
  textPrimary: "--rb-text-primary",
  textSecondary: "--rb-text-secondary",
  border: "--rb-border",
  translation: "--rb-translation",
} as const satisfies Record<keyof ColorPalette, string>;

// 自动推导的侧边栏文字色（方案二）：不在 ColorPalette schema 内，由 sidebarBg 亮度计算。
export const SIDEBAR_TEXT_VAR = "--rb-sidebar-text";
export const SIDEBAR_TEXT_MUTED_VAR = "--rb-sidebar-text-muted";

/**
 * 当前项目默认配色。注意：本项目 Tailwind @theme 把 blue-* 重映射为低饱和蓝，
 * 故这里用真实生效值（blue-600=#45597a 等），保证默认皮肤与改造前像素一致。
 */
export const DEFAULT_PALETTE: ColorPalette = {
  sidebarBg: "#111827",
  sidebarActive: "#45597a",
  primary: "#45597a",
  primaryHover: "#3a4a64",
  pageBg: "#f9fafb",
  cardBg: "#ffffff",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  border: "#e5e7eb",
  translation: "#334054",
};

export const PRESET_PALETTES: readonly SavedPalette[] = [
  {
    id: "default",
    name: "默认蓝",
    builtIn: true,
    createdAt: 0,
    palette: DEFAULT_PALETTE,
  },
  {
    id: "academic-green",
    name: "学院绿",
    builtIn: true,
    createdAt: 0,
    palette: {
      sidebarBg: "#14342b",
      sidebarActive: "#1b5e44",
      primary: "#1b5e44",
      primaryHover: "#14442f",
      pageBg: "#f7f5ef",
      cardBg: "#fffdf8",
      textPrimary: "#1f2937",
      textSecondary: "#6b7280",
      border: "#e4e0d4",
      translation: "#1b5e44",
    },
  },
  {
    id: "dark-purple",
    name: "暗夜紫",
    builtIn: true,
    createdAt: 0,
    palette: {
      sidebarBg: "#1e1b2e",
      sidebarActive: "#7c3aed",
      primary: "#7c3aed",
      primaryHover: "#6d28d9",
      pageBg: "#17141f",
      cardBg: "#221d33",
      textPrimary: "#ede9f5",
      textSecondary: "#a99fc4",
      border: "#352d4d",
      translation: "#c4b5fd",
    },
  },
  {
    id: "warm-orange",
    name: "暖橙",
    builtIn: true,
    createdAt: 0,
    palette: {
      sidebarBg: "#2b1b12",
      sidebarActive: "#ea580c",
      primary: "#ea580c",
      primaryHover: "#c2410c",
      pageBg: "#fdf6f0",
      cardBg: "#fffaf5",
      textPrimary: "#27211d",
      textSecondary: "#78716c",
      border: "#ecdfd3",
      translation: "#c2410c",
    },
  },
] as const;

function parseHex(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/** WCAG 相对亮度，0（黑）~ 1（白）。 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * 方案二：按 sidebarBg 亮度自动选侧边栏文字色。深底用浅字、浅底用深字，
 * muted 取主文字色的半透明叠加值（白底变浅灰、黑底变浅灰）。
 */
export function deriveSidebarText(sidebarBg: string): {
  text: string;
  muted: string;
} {
  const dark = relativeLuminance(sidebarBg) < 0.4;
  return dark
    ? { text: "#f9fafb", muted: "#9ca3af" }
    : { text: "#111827", muted: "#4b5563" };
}

export function buildCssVariables(palette: ColorPalette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [token, varName] of Object.entries(PALETTE_CSS_VARS)) {
    vars[varName] = palette[token as keyof ColorPalette];
  }
  const sidebar = deriveSidebarText(palette.sidebarBg);
  vars[SIDEBAR_TEXT_VAR] = sidebar.text;
  vars[SIDEBAR_TEXT_MUTED_VAR] = sidebar.muted;
  return vars;
}

/** 副作用边界：把调色盘写入 :root（或给定元素），实现即时换肤。 */
export function applyPalette(
  palette: ColorPalette,
  root: HTMLElement = document.documentElement,
): void {
  const vars = buildCssVariables(palette);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}

/** 按 id 取预设；找不到返回 undefined。 */
export function findPreset(id: string): SavedPalette | undefined {
  return PRESET_PALETTES.find((preset) => preset.id === id);
}

// activePaletteId 取此值时表示使用「正在编辑/尚未保存」的自定义配色（customPalette）。
export const CUSTOM_PALETTE_ID = "custom";

/**
 * 由当前 settings + 已保存方案解析出实际生效的配色。优先级：
 * custom 伪 id → customPalette；否则在 内置预设 ∪ 已保存方案 中按 id 查；都没有则回落默认。
 */
export function resolvePalette(
  activePaletteId: string | null,
  customPalette: ColorPalette | null,
  savedPalettes: readonly SavedPalette[] = [],
): ColorPalette {
  if (activePaletteId === CUSTOM_PALETTE_ID && customPalette) {
    return customPalette;
  }
  const match = [...PRESET_PALETTES, ...savedPalettes].find(
    (entry) => entry.id === activePaletteId,
  );
  return match?.palette ?? DEFAULT_PALETTE;
}
