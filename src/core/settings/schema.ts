import { z } from "zod";
import { DEFAULT_UI_LOCALE, UiLocaleSchema } from "@/core/i18n";
import { ColorPaletteSchema } from "@/core/colorPalette";
import { PermissionModeSchema } from "@/core/agent/types";

export const ViewModeSchema = z.enum(["original", "translation", "bilingual"]);

export type ViewMode = z.infer<typeof ViewModeSchema>;

export const WebSearchProviderSchema = z.enum(["tavily", "perplexity"]);

export type WebSearchProvider = z.infer<typeof WebSearchProviderSchema>;

/**
 * AppSettings — 全局用户偏好单例（settings 表 key="app" 的 value）。
 * 跨项目共享，不含敏感的 Provider Key（Key 存 secrets 表）。
 */
export const AppSettingsSchema = z.object({
  activeProviderId: z.string().nullable(),
  viewMode: ViewModeSchema,
  targetLang: z.string(),
  debugMode: z.boolean(),
  uiLocale: UiLocaleSchema,
  lastProjectId: z.string().nullable(),
  // .default() 让旧备份（无这两字段）仍可通过 AppSettingsSchema 解析；输出类型仍为必填。
  activePaletteId: z.string().nullable().default("default"),
  customPalette: ColorPaletteSchema.nullable().default(null),
  semanticScholarApiKey: z.string().default(""),
  openAlexApiKey: z.string().default(""),
  allowWeb: z.boolean().default(false),
  allowCode: z.boolean().default(false),
  webSearchProvider: WebSearchProviderSchema.default("tavily"),
  tavilyApiKey: z.string().default(""),
  perplexityApiKey: z.string().default(""),
  permissionMode: PermissionModeSchema.default("default"),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  activeProviderId: null,
  viewMode: "original",
  targetLang: "zh",
  debugMode: false,
  uiLocale: DEFAULT_UI_LOCALE,
  lastProjectId: null,
  activePaletteId: "default",
  customPalette: null,
  semanticScholarApiKey: "",
  openAlexApiKey: "",
  allowWeb: false,
  allowCode: false,
  webSearchProvider: "tavily",
  tavilyApiKey: "",
  perplexityApiKey: "",
  permissionMode: "default",
};
