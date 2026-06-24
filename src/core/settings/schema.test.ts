import { describe, expect, it } from "vitest";
import { AppSettingsSchema, DEFAULT_SETTINGS } from "./schema";

describe("AppSettingsSchema", () => {
  it("applies empty defaults for legacy settings without academic search keys", () => {
    const parsed = AppSettingsSchema.parse({
      activeProviderId: null,
      viewMode: "original",
      targetLang: "zh",
      debugMode: false,
      uiLocale: "en",
      lastProjectId: null,
    });

    expect(parsed.semanticScholarApiKey).toBe("");
    expect(parsed.openAlexApiKey).toBe("");
  });

  it("round-trips academic search api keys", () => {
    const parsed = AppSettingsSchema.parse({
      ...DEFAULT_SETTINGS,
      semanticScholarApiKey: "ss-key",
      openAlexApiKey: "oa-key",
    });

    expect(parsed.semanticScholarApiKey).toBe("ss-key");
    expect(parsed.openAlexApiKey).toBe("oa-key");
  });
});
