import { describe, it, expect } from "vitest";
import { resolveUiLocaleFromLanguages } from "./resolveUiLocale";

describe("resolveUiLocaleFromLanguages", () => {
  it("prefers the first supported language tag", () => {
    expect(resolveUiLocaleFromLanguages(["fr-FR", "en-US"])).toBe("en");
    expect(resolveUiLocaleFromLanguages(["ja", "zh-CN"])).toBe("zh");
  });

  it("recognizes Chinese and English variants", () => {
    expect(resolveUiLocaleFromLanguages(["zh-CN"])).toBe("zh");
    expect(resolveUiLocaleFromLanguages(["zh-TW"])).toBe("zh");
    expect(resolveUiLocaleFromLanguages(["en"])).toBe("en");
    expect(resolveUiLocaleFromLanguages(["en-GB"])).toBe("en");
  });

  it("falls back to English when no tag is supported", () => {
    expect(resolveUiLocaleFromLanguages([])).toBe("en");
    expect(resolveUiLocaleFromLanguages(["fr-FR", "de-DE"])).toBe("en");
  });
});
