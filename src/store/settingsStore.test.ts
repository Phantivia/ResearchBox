import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
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
    uiLocale: "zh",
    loaded: false,
  });
});

describe("useSettingsStore", () => {
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
