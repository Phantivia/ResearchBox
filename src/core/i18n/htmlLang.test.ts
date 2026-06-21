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

  it("falls back to default for Chinese and missing values", () => {
    expect(htmlLangToUiLocale("zh-CN")).toBe("zh");
    expect(htmlLangToUiLocale(null)).toBe("zh");
  });
});
