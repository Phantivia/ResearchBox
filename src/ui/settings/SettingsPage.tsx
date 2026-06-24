import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TRANSLATION_REASONING_EFFORT,
  listAvailableModels,
  resolveDefaultReasoningEffort,
  resolveOpenRouterModelMetadata,
  resolveTranslationReasoningEffort,
  supportsModelListing,
  supportsOpenRouterMetaLookup,
  testProviderConnection,
  type ConnectionTestHintCode,
  type ProviderConfig,
  type ReasoningEffort,
  type StoredOpenRouterModelMeta,
} from "@/core/llm";
import { LanguageSwitcher, useTranslation } from "@/i18n";
import type { MessageKey } from "@/core/i18n";
import { InstallButton } from "@/pwa";
import { clearAllTranslationCache } from "@/db";
import type { ViewMode } from "@/store";
import { useSettingsStore, useStorageStore, useTranslationJobStore } from "@/store";
import { AboutSection } from "./AboutSection";
import { AcademicSearchSection } from "./AcademicSearchSection";
import { AgentCapabilitiesSection } from "./AgentCapabilitiesSection";
import { ChatBoxSection } from "./ChatBoxSection";
import { DataManagementSection } from "./DataManagementSection";
import { ColorPaletteSection } from "./ColorPaletteSection";
import { OpenRouterMetaPanel } from "./OpenRouterMetaPanel";
import {
  SETTINGS_SECTION_IDS,
  scrollToSettingsSection,
  type SettingsSectionId,
} from "./sections";

const PROVIDER_IDS = [
  "openai",
  "deepseek",
  "anthropic",
  "gemini",
  "openrouter",
  "siliconflow",
] as const;

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
};

const NO_AUTOFILL_INPUT_PROPS = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-form-type": "other",
} as const;

const VIEW_MODE_VALUES = ["original", "translation", "bilingual"] as const satisfies readonly ViewMode[];

const REASONING_EFFORT_VALUES = ["high", "medium", "low", "off"] as const satisfies readonly ReasoningEffort[];

const TARGET_LANG_VALUES = ["zh", "en", "ja", "ko", "de", "fr"] as const;

type ProviderId = (typeof PROVIDER_IDS)[number];

type TestStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "success"; message: string; detail: string }
  | { state: "error"; message: string; detail: string };

type ModelListStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success" }
  | { state: "error"; message: string };

type OpenRouterMetaPanelStatus =
  | "idle"
  | "loading"
  | "success"
  | "not_found"
  | "error";

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    return "—";
  }
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function emptyDraft(id: ProviderId): ProviderConfig {
  return {
    id,
    apiKey: "",
    baseURL: DEFAULT_BASE_URLS[id] ?? "",
    model: "",
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    translationReasoningEffort: DEFAULT_TRANSLATION_REASONING_EFFORT,
  };
}

function formatTestHints(
  hints: readonly ConnectionTestHintCode[],
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  return hints
    .map((hint) => t(`settings.testHint.${hint}` as MessageKey))
    .join("\n");
}

export function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    providers,
    activeProviderId,
    viewMode,
    targetLang,
    debugMode,
    loaded,
    load,
    saveProvider,
    deleteProvider,
    setActiveProviderId,
    setViewMode,
    setTargetLang,
    setDebugMode,
  } = useSettingsStore();

  const [draft, setDraft] = useState<ProviderConfig>(emptyDraft("openai"));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: "idle" });
  const [apiKeyFocused, setApiKeyFocused] = useState(false);
  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelListStatus, setModelListStatus] = useState<ModelListStatus>({
    state: "idle",
  });
  const [openRouterMetaStatus, setOpenRouterMetaStatus] =
    useState<OpenRouterMetaPanelStatus>("idle");
  const [openRouterMetaError, setOpenRouterMetaError] = useState<string>("");
  const [draftOpenRouterMeta, setDraftOpenRouterMeta] = useState<
    StoredOpenRouterModelMeta | null | undefined
  >(undefined);
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const fetchRequestId = useRef(0);
  const openRouterMetaRequestId = useRef(0);
  const cancelAllTranslations = useTranslationJobStore(
    (state) => state.cancelAllTranslations,
  );
  const refreshStorage = useStorageStore((state) => state.refresh);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  useEffect(() => {
    const scrollTo = (location.state as { scrollTo?: SettingsSectionId } | null)
      ?.scrollTo;
    if (!scrollTo) {
      return;
    }

    const timer = window.setTimeout(() => {
      scrollToSettingsSection(scrollTo);
      navigate(location.pathname, { replace: true, state: null });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    if (activeProviderId) {
      const active = providers.find((provider) => provider.id === activeProviderId);
      if (active) {
        setDraft(active);
        setDraftOpenRouterMeta(active.openRouterMeta);
        setOpenRouterMetaStatus(
          active.openRouterMeta ? "success" : "idle",
        );
        return;
      }
    }

    const existing = providers.find((provider) => provider.id === draft.id);
    if (existing) {
      setDraft(existing);
      setDraftOpenRouterMeta(existing.openRouterMeta);
      setOpenRouterMetaStatus(
        existing.openRouterMeta ? "success" : "idle",
      );
    }
  }, [loaded]);

  useEffect(() => {
    if (
      !supportsOpenRouterMetaLookup(draft.id) ||
      !draft.apiKey.trim() ||
      !draft.model.trim()
    ) {
      setOpenRouterMetaStatus("idle");
      setOpenRouterMetaError("");
      setDraftOpenRouterMeta(undefined);
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchOpenRouterMeta({
        id: draft.id,
        apiKey: draft.apiKey.trim(),
        model: draft.model.trim(),
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [draft.id, draft.apiKey, draft.model]);

  useEffect(() => {
    if (!supportsModelListing(draft.id) || !draft.apiKey.trim()) {
      setModelOptions([]);
      setModelListStatus({ state: "idle" });
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchModelOptions({
        ...draft,
        apiKey: draft.apiKey.trim(),
        baseURL: draft.baseURL.trim(),
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [draft.id, draft.apiKey, draft.baseURL]);

  async function fetchOpenRouterMeta(input: {
    id: string;
    apiKey: string;
    model: string;
  }) {
    if (!supportsOpenRouterMetaLookup(input.id)) {
      return;
    }

    const requestId = ++openRouterMetaRequestId.current;
    setOpenRouterMetaStatus("loading");
    setOpenRouterMetaError("");

    try {
      const meta = await resolveOpenRouterModelMetadata({
        providerId: input.id,
        model: input.model,
        apiKey: input.id === "openrouter" ? input.apiKey : undefined,
      });

      if (requestId !== openRouterMetaRequestId.current) {
        return;
      }

      setDraftOpenRouterMeta(meta);
      setOpenRouterMetaStatus(meta ? "success" : "not_found");
    } catch (error) {
      if (requestId !== openRouterMetaRequestId.current) {
        return;
      }

      setDraftOpenRouterMeta(null);
      const message = error instanceof Error ? error.message : "Unknown error";
      setOpenRouterMetaError(message);
      setOpenRouterMetaStatus("error");
    }
  }

  async function fetchModelOptions(config: ProviderConfig) {
    if (!supportsModelListing(config.id) || !config.apiKey.trim()) {
      return;
    }

    const requestId = ++fetchRequestId.current;
    setModelListStatus({ state: "loading" });
    try {
      const models = await listAvailableModels({
        ...config,
        apiKey: config.apiKey.trim(),
        baseURL: config.baseURL.trim(),
      });

      if (requestId !== fetchRequestId.current) {
        return;
      }

      setModelOptions(models);
      setModelListStatus({ state: "success" });

      if (models.length > 0) {
        setDraft((current) => {
          if (current.model && models.includes(current.model)) {
            return current;
          }
          return { ...current, model: models[0] ?? "" };
        });
      }
    } catch (error) {
      if (requestId !== fetchRequestId.current) {
        return;
      }

      setModelOptions([]);
      const message = error instanceof Error ? error.message : "Unknown error";
      setModelListStatus({ state: "error", message });
    }
  }

  function handleProviderTypeChange(id: ProviderId) {
    const existing = providers.find((provider) => provider.id === id);
    const next = existing ?? emptyDraft(id);
    fetchRequestId.current += 1;
    openRouterMetaRequestId.current += 1;
    setDraft(next);
    setSaveMessage(null);
    setTestStatus({ state: "idle" });
    setModelOptions([]);
    setModelListStatus({ state: "idle" });
    setDraftOpenRouterMeta(next.openRouterMeta);
    setOpenRouterMetaStatus(next.openRouterMeta ? "success" : "idle");
    setOpenRouterMetaError("");
  }

  async function handleDeleteProvider(id: string) {
    if (!window.confirm(t("settings.deleteProviderConfirm"))) {
      return;
    }

    await deleteProvider(id);
    setSaveMessage(t("settings.providerDeleted"));

    if (draft.id === id) {
      setDraft(emptyDraft("openai"));
      setModelOptions([]);
      setModelListStatus({ state: "idle" });
      setDraftOpenRouterMeta(undefined);
      setOpenRouterMetaStatus("idle");
      setOpenRouterMetaError("");
    }
  }

  function toggleProviderDetails(id: string) {
    setExpandedProviderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSaveProvider(event: React.FormEvent) {
    event.preventDefault();
    setSaveMessage(null);

    if (!draft.apiKey.trim() || !draft.baseURL.trim() || !draft.model.trim()) {
      setSaveMessage(t("settings.fillRequired"));
      return;
    }

    const openRouterMeta = supportsOpenRouterMetaLookup(draft.id)
      ? await resolveOpenRouterModelMetadata({
          providerId: draft.id,
          model: draft.model.trim(),
          apiKey: draft.id === "openrouter" ? draft.apiKey.trim() : undefined,
        })
      : null;

    await saveProvider({
      ...draft,
      apiKey: draft.apiKey.trim(),
      baseURL: draft.baseURL.trim(),
      model: draft.model.trim(),
      openRouterMeta,
    });

    setDraftOpenRouterMeta(openRouterMeta);
    setOpenRouterMetaStatus(openRouterMeta ? "success" : "not_found");

    if (!activeProviderId) {
      await setActiveProviderId(draft.id);
    }

    setSaveMessage(t("settings.providerSaved"));
  }

  async function handleTestConnection() {
    setTestStatus({ state: "testing" });

    const result = await testProviderConnection({
      ...draft,
      apiKey: draft.apiKey.trim(),
      baseURL: draft.baseURL.trim(),
      model: draft.model.trim(),
    });

    if (result.ok) {
      setTestStatus({
        state: "success",
        message: t("settings.testSuccess"),
        detail: t("settings.testSuccessDetail", {
          latencyMs: Math.round(result.latencyMs),
          responseChars: result.responseChars,
          preview: result.responsePreview,
        }),
      });
      return;
    }

    setTestStatus({
      state: "error",
      message: t("settings.testFailed", { message: result.error }),
      detail: formatTestHints(result.hints, t),
    });
  }

  async function handleClearTranslationCache() {
    if (!window.confirm(t("settings.clearTranslationCacheConfirm"))) {
      return;
    }

    setClearingCache(true);
    setCacheClearMessage(null);

    try {
      cancelAllTranslations();
      const count = await clearAllTranslationCache();
      setCacheClearMessage(t("settings.clearTranslationCacheDone", { count }));
    } finally {
      setClearingCache(false);
    }
  }

  const showModelSelect =
    supportsModelListing(draft.id) &&
    (modelListStatus.state === "loading" || modelOptions.length > 0);

  return (
    <main className="relative z-10 min-h-screen overflow-x-clip">
      <div className="mx-auto min-w-0 max-w-2xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--rb-text-primary)]">{t("settings.title")}</h1>
          <Link to="/" className="text-sm text-[var(--rb-primary)] hover:underline">
            {t("common.backToHome")}
          </Link>
        </div>

        <section
          id={SETTINGS_SECTION_IDS.llmProvider}
          className="scroll-mt-4 mb-8 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-[var(--rb-text-primary)]">
            {t("settings.llmProvider")}
          </h2>
          <form
            onSubmit={handleSaveProvider}
            className="space-y-4"
            autoComplete="off"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.providerType")}
              </span>
              <select
                value={draft.id}
                onChange={(event) =>
                  handleProviderTypeChange(event.target.value as ProviderId)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...NO_AUTOFILL_INPUT_PROPS}
              >
                {PROVIDER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(`settings.provider.${id}` as "settings.provider.openai")}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.apiKey")}
              </span>
              <input
                type="text"
                name="rb-llm-api-key"
                value={draft.apiKey}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, apiKey: event.target.value }))
                }
                onFocus={() => setApiKeyFocused(true)}
                onBlur={() => setApiKeyFocused(false)}
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 [-webkit-text-security:disc] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...NO_AUTOFILL_INPUT_PROPS}
              />
              {apiKeyFocused && (
                <div
                  className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  role="alert"
                >
                  <p className="font-semibold">{t("settings.securityTitle")}</p>
                  <p className="mt-1">{t("settings.securityBody")}</p>
                </div>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.baseUrl")}
              </span>
              <input
                type="text"
                name="rb-llm-base-url"
                inputMode="url"
                value={draft.baseURL}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, baseURL: event.target.value }))
                }
                placeholder="https://api.openai.com/v1"
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...NO_AUTOFILL_INPUT_PROPS}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.model")}
              </span>
              {showModelSelect ? (
                <select
                  name="rb-llm-model"
                  value={draft.model}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, model: event.target.value }))
                  }
                  disabled={modelListStatus.state === "loading"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60"
                  {...NO_AUTOFILL_INPUT_PROPS}
                >
                  {modelListStatus.state === "loading" ? (
                    <option value="">{t("settings.fetchingModels")}</option>
                  ) : (
                    <>
                      {!draft.model && (
                        <option value="">{t("settings.selectModel")}</option>
                      )}
                      {modelOptions.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  name="rb-llm-model"
                  value={draft.model}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, model: event.target.value }))
                  }
                  placeholder="gpt-4o / claude-sonnet-4-20250514"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  {...NO_AUTOFILL_INPUT_PROPS}
                />
              )}
              {supportsModelListing(draft.id) &&
                !draft.apiKey.trim() &&
                modelListStatus.state === "idle" && (
                  <span className="mt-1 block text-xs text-gray-500">
                    {t("settings.fetchModelsHint")}
                  </span>
                )}
              {modelListStatus.state === "error" && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {t("settings.fetchModelsFailed", { message: modelListStatus.message })}
                </p>
              )}
              {modelListStatus.state === "success" && modelOptions.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {t("settings.fetchModelsEmpty")}
                </p>
              )}
              {supportsOpenRouterMetaLookup(draft.id) && (
                <OpenRouterMetaPanel
                  meta={draftOpenRouterMeta}
                  status={openRouterMetaStatus}
                  errorMessage={openRouterMetaError}
                />
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.reasoningEffort")}
              </span>
              <select
                value={draft.reasoningEffort ?? DEFAULT_REASONING_EFFORT}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reasoningEffort: event.target.value as ReasoningEffort,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...NO_AUTOFILL_INPUT_PROPS}
              >
                {REASONING_EFFORT_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`reasoning.${value}`)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-500">
                {t("settings.reasoningEffortHint")}
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.translationReasoningEffort")}
              </span>
              <select
                value={
                  draft.translationReasoningEffort ?? DEFAULT_TRANSLATION_REASONING_EFFORT
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    translationReasoningEffort: event.target.value as ReasoningEffort,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                {...NO_AUTOFILL_INPUT_PROPS}
              >
                {REASONING_EFFORT_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`reasoning.${value}`)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-500">
                {t("settings.translationReasoningEffortHint")}
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-lg bg-[var(--rb-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {t("settings.saveProvider")}
              </button>
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={testStatus.state === "testing"}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testStatus.state === "testing"
                  ? t("settings.testing")
                  : t("settings.testConnection")}
              </button>
            </div>

            {saveMessage && (
              <p className="text-sm text-green-700" role="status">
                {saveMessage}
              </p>
            )}

            {testStatus.state === "success" && (
              <div className="text-sm text-green-700" role="status">
                <p>{testStatus.message}</p>
                <p className="mt-1 whitespace-pre-line text-xs text-green-800/80">
                  {testStatus.detail}
                </p>
              </div>
            )}

            {testStatus.state === "error" && (
              <div className="text-sm text-red-600" role="alert">
                <p>{testStatus.message}</p>
                {testStatus.detail && (
                  <p className="mt-1 whitespace-pre-line text-xs text-red-700/90">
                    {testStatus.detail}
                  </p>
                )}
              </div>
            )}
          </form>
        </section>

        {providers.length > 0 && (
          <section
            id={SETTINGS_SECTION_IDS.savedProviders}
            className="scroll-mt-4 mb-8 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
          >
            <h2 className="mb-4 text-lg font-semibold text-[var(--rb-text-primary)]">
              {t("settings.savedProviders")}
            </h2>
            <fieldset className="space-y-2">
              <legend className="sr-only">{t("settings.selectActiveProvider")}</legend>
              {providers.map((provider) => {
                const expanded = expandedProviderIds.has(provider.id);
                const reasoningEffort = resolveDefaultReasoningEffort(provider);
                const translationReasoningEffort =
                  resolveTranslationReasoningEffort(provider);

                return (
                  <div
                    key={provider.id}
                    className="rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3 px-3 py-2">
                      <label className="flex flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="radio"
                          name="activeProvider"
                          checked={activeProviderId === provider.id}
                          onChange={() => void setActiveProviderId(provider.id)}
                        />
                        <span className="text-sm text-gray-800">
                          {t(`settings.provider.${provider.id}` as "settings.provider.openai")}
                          <span className="ml-2 text-gray-500">({provider.model})</span>
                        </span>
                      </label>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleProviderDetails(provider.id)}
                        className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        {expanded
                          ? t("settings.collapseProviderDetails")
                          : t("settings.expandProviderDetails")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteProvider(provider.id)}
                        className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                      >
                        {t("settings.deleteProvider")}
                      </button>
                    </div>
                    {expanded && (
                      <dl className="space-y-2 border-t border-gray-200 px-3 py-3 text-sm">
                        <div>
                          <dt className="font-medium text-gray-700">
                            {t("settings.providerType")}
                          </dt>
                          <dd className="mt-0.5 text-gray-600">
                            {t(`settings.provider.${provider.id}` as "settings.provider.openai")}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-700">{t("settings.baseUrl")}</dt>
                          <dd className="mt-0.5 break-all font-mono text-xs text-gray-600">
                            {provider.baseURL}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-700">{t("settings.model")}</dt>
                          <dd className="mt-0.5 text-gray-600">{provider.model}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-700">
                            {t("settings.reasoningEffort")}
                          </dt>
                          <dd className="mt-0.5 text-gray-600">
                            {t(`reasoning.${reasoningEffort}`)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-700">
                            {t("settings.translationReasoningEffort")}
                          </dt>
                          <dd className="mt-0.5 text-gray-600">
                            {t(`reasoning.${translationReasoningEffort}`)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-700">{t("settings.apiKey")}</dt>
                          <dd className="mt-0.5 font-mono text-xs text-gray-600">
                            {maskApiKey(provider.apiKey)}
                          </dd>
                        </div>
                        {supportsOpenRouterMetaLookup(provider.id) && (
                          <div>
                            <OpenRouterMetaPanel
                              meta={provider.openRouterMeta}
                              status={
                                provider.openRouterMeta
                                  ? "success"
                                  : provider.model.trim()
                                    ? "not_found"
                                    : "idle"
                              }
                            />
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </fieldset>
          </section>
        )}

        <AcademicSearchSection />

        <AgentCapabilitiesSection />
        <ChatBoxSection />

        <section
          id={SETTINGS_SECTION_IDS.readingPrefs}
          className="scroll-mt-4 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-[var(--rb-text-primary)]">
            {t("settings.readingPrefs")}
          </h2>
          <div className="space-y-4">
            <LanguageSwitcher />

            <InstallButton variant="settings" />

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.targetLang")}
              </span>
              <select
                value={targetLang}
                onChange={(event) => void setTargetLang(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {TARGET_LANG_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`targetLang.${value}`)}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-gray-700">
                {t("settings.defaultViewMode")}
              </legend>
              <div className="space-y-2">
                {VIEW_MODE_VALUES.map((mode) => (
                  <label
                    key={mode}
                    className="flex cursor-pointer items-center gap-3"
                  >
                    <input
                      type="radio"
                      name="viewMode"
                      checked={viewMode === mode}
                      onChange={() => void setViewMode(mode)}
                    />
                    <span className="text-sm text-gray-800">{t(`viewMode.${mode}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(event) => void setDebugMode(event.target.checked)}
              />
              <span className="text-sm font-medium text-gray-800">
                {t("settings.debugMode")}
              </span>
            </label>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {t("settings.clearTranslationCache")}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {t("settings.clearTranslationCacheHint")}
              </p>
              <button
                type="button"
                onClick={() => void handleClearTranslationCache()}
                disabled={clearingCache}
                className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {clearingCache
                  ? t("settings.clearingTranslationCache")
                  : t("settings.clearTranslationCache")}
              </button>
              {cacheClearMessage && (
                <p className="mt-2 text-sm text-green-700" role="status">
                  {cacheClearMessage}
                </p>
              )}
            </div>
          </div>
        </section>

        <ColorPaletteSection />

        <DataManagementSection />

        <AboutSection />
      </div>
    </main>
  );
}
