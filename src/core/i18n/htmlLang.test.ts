import { describe, it, expect } from "vitest";
import { htmlLangToUiLocale, uiLocaleToHtmlLang } from "./htmlLang";

describe("uiLocaleToHtmlLang", () => {
  it("maps zh to zh-CN", () => {
    expect(uiLocaleToHtmlLang("zh")).toBe("zh-CN");
  });

  it("maps en to en", () => {
    expect(uiLocaleToHtmlLang("en")).toBe("en");
  });
});

describe("htmlLangToUiLocale", () => {
  it("parses English variants", () => {
    expect(htmlLangToUiLocale("en")).toBe("en");
    expect(htmlLangToUiLocale("en-US")).toBe("en");
  });

  it("maps Chinese variants and falls back to English", () => {
    expect(htmlLangToUiLocale("zh-CN")).toBe("zh");
    expect(htmlLangToUiLocale("fr-FR")).toBe("en");
    expect(htmlLangToUiLocale(null)).toBe("en");
  });
});
