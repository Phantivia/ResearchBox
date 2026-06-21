import { describe, expect, it } from "vitest";
import {
  ColorPaletteSchema,
  CUSTOM_PALETTE_ID,
  DEFAULT_PALETTE,
  PALETTE_CSS_VARS,
  PRESET_PALETTES,
  SIDEBAR_TEXT_MUTED_VAR,
  SIDEBAR_TEXT_VAR,
  applyPalette,
  buildCssVariables,
  deriveSidebarText,
  findPreset,
  relativeLuminance,
  resolvePalette,
  type SavedPalette,
} from "./schema";

describe("ColorPaletteSchema", () => {
  it("accepts the default palette", () => {
    expect(ColorPaletteSchema.safeParse(DEFAULT_PALETTE).success).toBe(true);
  });

  it("rejects non-hex values", () => {
    const bad = { ...DEFAULT_PALETTE, primary: "rgb(0,0,0)" };
    expect(ColorPaletteSchema.safeParse(bad).success).toBe(false);
  });

  it("every built-in preset is a valid palette", () => {
    for (const preset of PRESET_PALETTES) {
      expect(ColorPaletteSchema.safeParse(preset.palette).success).toBe(true);
      expect(preset.builtIn).toBe(true);
    }
  });
});

describe("relativeLuminance", () => {
  it("returns 0 for black and ~1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("supports shorthand hex", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
  });
});

describe("deriveSidebarText", () => {
  it("picks light text on a dark sidebar", () => {
    expect(deriveSidebarText("#111827").text).toBe("#f9fafb");
  });

  it("picks dark text on a light sidebar", () => {
    expect(deriveSidebarText("#f7f5ef").text).toBe("#111827");
  });
});

describe("buildCssVariables", () => {
  it("maps every token plus derived sidebar text vars", () => {
    const vars = buildCssVariables(DEFAULT_PALETTE);
    for (const [token, varName] of Object.entries(PALETTE_CSS_VARS)) {
      expect(vars[varName]).toBe(
        DEFAULT_PALETTE[token as keyof typeof DEFAULT_PALETTE],
      );
    }
    expect(vars[SIDEBAR_TEXT_VAR]).toBe("#f9fafb");
    expect(vars[SIDEBAR_TEXT_MUTED_VAR]).toBeDefined();
  });
});

describe("applyPalette", () => {
  it("writes CSS variables onto the target element", () => {
    const el = document.createElement("div");
    applyPalette(findPreset("dark-purple")!.palette, el);
    expect(el.style.getPropertyValue("--rb-primary")).toBe("#7c3aed");
    expect(el.style.getPropertyValue(SIDEBAR_TEXT_VAR)).toBe("#f9fafb");
  });
});

describe("findPreset", () => {
  it("finds built-ins by id and returns undefined otherwise", () => {
    expect(findPreset("default")?.name).toBe("默认蓝");
    expect(findPreset("nope")).toBeUndefined();
  });
});

describe("resolvePalette", () => {
  const saved: SavedPalette = {
    id: "mine",
    name: "Mine",
    builtIn: false,
    createdAt: 1,
    palette: { ...DEFAULT_PALETTE, primary: "#abcdef" },
  };

  it("returns customPalette for the custom id", () => {
    const custom = { ...DEFAULT_PALETTE, primary: "#123456" };
    expect(resolvePalette(CUSTOM_PALETTE_ID, custom).primary).toBe("#123456");
  });

  it("resolves built-in and saved presets by id", () => {
    expect(resolvePalette("dark-purple", null).primary).toBe("#7c3aed");
    expect(resolvePalette("mine", null, [saved]).primary).toBe("#abcdef");
  });

  it("falls back to default for unknown ids or null", () => {
    expect(resolvePalette(null, null)).toEqual(DEFAULT_PALETTE);
    expect(resolvePalette("ghost", null)).toEqual(DEFAULT_PALETTE);
    expect(resolvePalette(CUSTOM_PALETTE_ID, null)).toEqual(DEFAULT_PALETTE);
  });
});
