import { describe, it, expect } from "vitest";
import { normalizeTex } from "./normalizeTex";

describe("normalizeTex", () => {
  it("rewrites LaTeXML siunitx micro symbols for KaTeX", () => {
    expect(normalizeTex(String.raw`\mathrm{\SIUnitSymbolMicro s}`)).toBe(
      String.raw`\mathrm{\mu s}`,
    );
    expect(normalizeTex(String.raw`1030\text{\,}\mathrm{\SIUnitSymbolMicro s}`)).toBe(
      String.raw`1030\text{\,}\mathrm{\mu s}`,
    );
  });

  it("rewrites other common SIUnitSymbol macros", () => {
    expect(normalizeTex(String.raw`\SIUnitSymbolDegree`)).toBe("^{\\circ}");
    expect(normalizeTex(String.raw`\SIUnitSymbolArcminute`)).toBe("^{\\prime}");
    expect(normalizeTex(String.raw`\SIUnitSymbolOhm`)).toBe("\\Omega");
  });

  it("leaves unknown TeX untouched", () => {
    expect(normalizeTex("x^2")).toBe("x^2");
  });
});
