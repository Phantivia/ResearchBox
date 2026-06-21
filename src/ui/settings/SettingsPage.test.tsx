import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { db } from "@/db";
import { saveProviderConfig, saveSettings } from "@/db";
import { useSettingsStore } from "@/store/settingsStore";
import { SettingsPage } from "./SettingsPage";

vi.mock("@/pwa", () => ({
  InstallButton: () => null,
}));

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

describe("SettingsPage", () => {
  it("renders the provider form and shows security notice when API key is focused", async () => {
    render(
      <HashRouter>
        <SettingsPage />
      </HashRouter>,
    );

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存 Provider" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Debug 模式/ })).toBeInTheDocument();

    expect(
      screen.queryByText(/API Key 仅保存在本机浏览器的 IndexedDB 中/),
    ).not.toBeInTheDocument();

    const apiKeyInput = screen.getByLabelText("API Key");
    fireEvent.focus(apiKeyInput);

    expect(
      await screen.findByText(/API Key 仅保存在本机浏览器的 IndexedDB 中/),
    ).toBeInTheDocument();
  });

  it("prefills the provider form with the active saved provider on load", async () => {
    await saveProviderConfig({
      id: "deepseek",
      apiKey: "sk-deepseek-test",
      baseURL: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      reasoningEffort: "medium",
    });
    await saveSettings({ activeProviderId: "deepseek" });

    render(
      <HashRouter>
        <SettingsPage />
      </HashRouter>,
    );

    await waitFor(() => {
      expect(useSettingsStore.getState().loaded).toBe(true);
    });

    expect(screen.getByLabelText("Provider 类型")).toHaveValue("deepseek");
    expect(screen.getByLabelText("API Key")).toHaveValue("sk-deepseek-test");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://api.deepseek.com/v1");
    expect(screen.getByLabelText("Model")).toHaveValue("deepseek-chat");
  });
});
