const SI_UNIT_SYMBOL_REPLACEMENTS: Record<string, string> = {
  Micro: "\\mu",
  Celsius: "^{\\circ}\\mathrm{C}",
  Ohm: "\\Omega",
  Degree: "^{\\circ}",
  Arcminute: "^{\\prime}",
  Arcsecond: "^{\\prime\\prime}",
  Angstrom: "\\mathring{\\mathrm{A}}",
};

export function normalizeTex(tex: string): string {
  let result = tex.replace(/\\textmu\b/g, "\\mu");
  result = result.replace(/\\micro\b/g, "\\mu");
  result = result.replace(/\\SIUnitSymbol(\w+)/g, (_match, name: string) => {
    return SI_UNIT_SYMBOL_REPLACEMENTS[name] ?? _match;
  });
  return result;
}
