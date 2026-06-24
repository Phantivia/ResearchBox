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
    expect(parsed.allowWeb).toBe(false);
    expect(parsed.allowCode).toBe(false);
    expect(parsed.webSearchProvider).toBe("tavily");
    expect(parsed.tavilyApiKey).toBe("");
    expect(parsed.perplexityApiKey).toBe("");
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

  it("round-trips agent capability settings", () => {
    const parsed = AppSettingsSchema.parse({
      ...DEFAULT_SETTINGS,
      allowWeb: true,
      allowCode: true,
      webSearchProvider: "perplexity",
      tavilyApiKey: "tv-key",
      perplexityApiKey: "px-key",
    });

    expect(parsed.allowWeb).toBe(true);
    expect(parsed.allowCode).toBe(true);
    expect(parsed.webSearchProvider).toBe("perplexity");
    expect(parsed.tavilyApiKey).toBe("tv-key");
    expect(parsed.perplexityApiKey).toBe("px-key");
  });
});
