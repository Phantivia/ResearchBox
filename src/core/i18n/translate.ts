import { UI_MESSAGES, type MessageKey } from "./messages";
import { DEFAULT_UI_LOCALE, UiLocaleSchema, type UiLocale } from "./schema";

export function normalizeUiLocale(value: unknown): UiLocale {
  const parsed = UiLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_UI_LOCALE;
}

export function translate(
  locale: UiLocale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const catalog = UI_MESSAGES[locale] ?? UI_MESSAGES[DEFAULT_UI_LOCALE];
  const fallback = UI_MESSAGES[DEFAULT_UI_LOCALE];
  let text: string = catalog[key] ?? fallback[key] ?? key;

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }

  return text;
}
