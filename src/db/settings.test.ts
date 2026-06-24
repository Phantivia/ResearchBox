import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import type { ProviderConfig } from "@/core/llm";
import {
  db,
  DEFAULT_SETTINGS,
  getProviderConfig,
  getSettings,
  listProviderConfigs,
  saveProviderConfig,
  saveSettings,
} from "./index";

const OPENAI_CONFIG: ProviderConfig = {
  id: "openai",
  apiKey: "sk-test-openai",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o",
  openRouterMeta: {
    source: "openrouter",
    fetchedAt: 1_700_000_000_000,
    openRouterId: "openai/gpt-4o",
    name: "OpenAI: GPT-4o",
    contextLength: 128000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportedParameters: ["response_format"],
  },
};

const ANTHROPIC_CONFIG: ProviderConfig = {
  id: "anthropic",
  apiKey: "sk-test-anthropic",
  baseURL: "https://api.anthropic.com/v1",
  model: "claude-sonnet-4-20250514",
};

beforeEach(async () => {
  await db.secrets.clear();
  await db.settings.clear();
});

describe("provider config helpers", () => {
  it("round-trips a provider config through save and get", async () => {
    await saveProviderConfig(OPENAI_CONFIG);

    const stored = await getProviderConfig("openai");
    expect(stored).toEqual(OPENAI_CONFIG);
  });

  it("lists all saved provider configs", async () => {
    await saveProviderConfig(OPENAI_CONFIG);
    await saveProviderConfig(ANTHROPIC_CONFIG);

    const configs = await listProviderConfigs();
    expect(configs).toHaveLength(2);
    expect(configs).toEqual(
      expect.arrayContaining([OPENAI_CONFIG, ANTHROPIC_CONFIG]),
    );
  });

  it("upserts provider config by provider id", async () => {
    await saveProviderConfig(OPENAI_CONFIG);
    await saveProviderConfig({ ...OPENAI_CONFIG, model: "gpt-4o-mini" });

    const configs = await listProviderConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0]?.model).toBe("gpt-4o-mini");
  });

  it("returns undefined for a missing provider id", async () => {
    const result = await getProviderConfig("openai");
    expect(result).toBeUndefined();
  });
});

describe("settings helpers", () => {
  it("returns defaults when no settings row exists", async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial updates into the settings singleton", async () => {
    await saveSettings({ activeProviderId: "openai", targetLang: "en" });
    const settings = await saveSettings({ viewMode: "bilingual" });

    expect(settings).toEqual({
      activeProviderId: "openai",
      viewMode: "bilingual",
      targetLang: "en",
      debugMode: false,
      uiLocale: "en",
      lastProjectId: null,
      activePaletteId: "default",
      customPalette: null,
      semanticScholarApiKey: "",
      openAlexApiKey: "",
      allowWeb: false,
      allowCode: false,
      webSearchProvider: "tavily",
      tavilyApiKey: "",
      perplexityApiKey: "",
    });

    const reloaded = await getSettings();
    expect(reloaded).toEqual(settings);
  });
});
