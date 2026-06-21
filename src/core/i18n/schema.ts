import { z } from "zod";

export const UiLocaleSchema = z.enum(["zh", "en"]);

export type UiLocale = z.infer<typeof UiLocaleSchema>;

export const DEFAULT_UI_LOCALE: UiLocale = "zh";
