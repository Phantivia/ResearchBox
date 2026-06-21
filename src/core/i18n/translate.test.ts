import { describe, it, expect } from "vitest";
import { translate } from "./translate";

describe("translate", () => {
  it("returns Chinese strings for zh locale", () => {
    expect(translate("zh", "reader.startTranslation")).toBe("翻译");
  });

  it("returns English strings for en locale", () => {
    expect(translate("en", "reader.startTranslation")).toBe("Translate");
  });

  it("interpolates params", () => {
    expect(
      translate("en", "annotation.title", { count: 3 }),
    ).toBe("Annotations (3)");
  });
});
