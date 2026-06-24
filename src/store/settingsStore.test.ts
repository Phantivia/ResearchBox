import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, getSettings } from "@/db";
import { useSettingsStore } from "./settingsStore";

const OPENAI_CONFIG = {
  id: "openai",
  apiKey: "sk-test",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o",
};

beforeEach(async () => {
  await db.secrets.clear();
  await db.settings.clear();
  useSettingsStore.setState({
    providers: [],
    activeProviderId: null,
    viewMode: "original",
    targetLang: "zh",
    debugMode: false,
    uiLocale: "en",
    loaded: false,
    semanticScholarApiKey: "",
    openAlexApiKey: "",
    allowWeb: false,
    allowCode: false,
    webSearchProvider: "tavily",
    tavilyApiKey: "",
    perplexityApiKey: "",
  });
});

describe("useSettingsStore", () => {
  it("persists uiLocale from browser languages on first load", async () => {
    vi.stubGlobal("navigator", {
      languages: ["zh-CN"],
      language: "zh-CN",
    });

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().uiLocale).toBe("zh");
    expect((await getSettings()).uiLocale).toBe("zh");
  });

  it("falls back to English when browser language is unsupported", async () => {
    vi.stubGlobal("navigator", {
      languages: ["fr-FR"],
      language: "fr-FR",
    });

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().uiLocale).toBe("en");
    expect((await getSettings()).uiLocale).toBe("en");
  });

  it("loads providers and settings from IndexedDB", async () => {
    const store = useSettingsStore.getState();
    await store.saveProvider(OPENAI_CONFIG);
    await store.setActiveProviderId("openai");
    await store.setViewMode("translation");
    await store.setTargetLang("en");
    await store.setDebugMode(true);

    useSettingsStore.setState({ loaded: false });
    await useSettingsStore.getState().load();

    const state = useSettingsStore.getState();
    expect(state.providers).toEqual([OPENAI_CONFIG]);
    expect(state.activeProviderId).toBe("openai");
    expect(state.viewMode).toBe("translation");
    expect(state.targetLang).toBe("en");
    expect(state.debugMode).toBe(true);
    expect(state.loaded).toBe(true);
  });

  it("persists academic search api keys", async () => {
    const store = useSettingsStore.getState();
    await store.setSemanticScholarApiKey("ss-test-key");
    await store.setOpenAlexApiKey("oa-test-key");

    useSettingsStore.setState({ loaded: false });
    await useSettingsStore.getState().load();

    const state = useSettingsStore.getState();
    expect(state.semanticScholarApiKey).toBe("ss-test-key");
    expect(state.openAlexApiKey).toBe("oa-test-key");
    expect((await getSettings()).semanticScholarApiKey).toBe("ss-test-key");
    expect((await getSettings()).openAlexApiKey).toBe("oa-test-key");
  });

  it("persists agent capability settings", async () => {
    const store = useSettingsStore.getState();
    await store.setAllowWeb(true);
    await store.setAllowCode(true);
    await store.setWebSearchProvider("perplexity");
    await store.setTavilyApiKey("tv-test-key");
    await store.setPerplexityApiKey("px-test-key");

    useSettingsStore.setState({ loaded: false });
    await useSettingsStore.getState().load();

    const state = useSettingsStore.getState();
    expect(state.allowWeb).toBe(true);
    expect(state.allowCode).toBe(true);
    expect(state.webSearchProvider).toBe("perplexity");
    expect(state.tavilyApiKey).toBe("tv-test-key");
    expect(state.perplexityApiKey).toBe("px-test-key");
    const persisted = await getSettings();
    expect(persisted.allowWeb).toBe(true);
    expect(persisted.allowCode).toBe(true);
    expect(persisted.webSearchProvider).toBe("perplexity");
    expect(persisted.tavilyApiKey).toBe("tv-test-key");
    expect(persisted.perplexityApiKey).toBe("px-test-key");
  });

  it("reports whether an active provider is configured", async () => {
    const store = useSettingsStore.getState();
    expect(store.hasActiveProvider()).toBe(false);

    await store.saveProvider(OPENAI_CONFIG);
    await store.setActiveProviderId("openai");

    expect(useSettingsStore.getState().hasActiveProvider()).toBe(true);
  });

  it("returns false when active provider is missing required fields", async () => {
    const store = useSettingsStore.getState();
    await store.saveProvider({ ...OPENAI_CONFIG, apiKey: "  " });
    await store.setActiveProviderId("openai");

    expect(useSettingsStore.getState().hasActiveProvider()).toBe(false);
  });

  it("deletes a saved provider and clears it as active if needed", async () => {
    const store = useSettingsStore.getState();
    await store.saveProvider(OPENAI_CONFIG);
    await store.setActiveProviderId("openai");

    await store.deleteProvider("openai");

    const state = useSettingsStore.getState();
    expect(state.providers).toEqual([]);
    expect(state.activeProviderId).toBeNull();
  });

  it("deletes a saved provider without touching the active provider if different", async () => {
    const store = useSettingsStore.getState();
    await store.saveProvider(OPENAI_CONFIG);
    await store.saveProvider({
      ...OPENAI_CONFIG,
      id: "deepseek",
      baseURL: "https://api.deepseek.com/v1",
    });
    await store.setActiveProviderId("deepseek");

    await store.deleteProvider("openai");

    const state = useSettingsStore.getState();
    expect(state.providers.map((p) => p.id)).toEqual(["deepseek"]);
    expect(state.activeProviderId).toBe("deepseek");
  });
});
