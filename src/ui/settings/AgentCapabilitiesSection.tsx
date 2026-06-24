import type { WebSearchProvider } from "@/core/settings";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/store";
import { SETTINGS_SECTION_IDS } from "./sections";

const NO_AUTOFILL_INPUT_PROPS = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-form-type": "other",
} as const;

const WEB_SEARCH_PROVIDER_VALUES = ["tavily", "perplexity"] as const satisfies readonly WebSearchProvider[];

export function AgentCapabilitiesSection() {
  const { t } = useTranslation();
  const allowWeb = useSettingsStore((state) => state.allowWeb);
  const allowCode = useSettingsStore((state) => state.allowCode);
  const webSearchProvider = useSettingsStore((state) => state.webSearchProvider);
  const tavilyApiKey = useSettingsStore((state) => state.tavilyApiKey);
  const perplexityApiKey = useSettingsStore((state) => state.perplexityApiKey);
  const setAllowWeb = useSettingsStore((state) => state.setAllowWeb);
  const setAllowCode = useSettingsStore((state) => state.setAllowCode);
  const setWebSearchProvider = useSettingsStore((state) => state.setWebSearchProvider);
  const setTavilyApiKey = useSettingsStore((state) => state.setTavilyApiKey);
  const setPerplexityApiKey = useSettingsStore((state) => state.setPerplexityApiKey);

  return (
    <section
      id={SETTINGS_SECTION_IDS.agentCapabilities}
      className="scroll-mt-4 mb-8 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
    >
      <h2 className="mb-4 text-lg font-semibold text-[var(--rb-text-primary)]">
        {t("settings.agentCapabilities")}
      </h2>
      <div className="space-y-4">
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3">
            <input
              type="checkbox"
              checked={allowWeb}
              onChange={(event) => void setAllowWeb(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm font-medium text-gray-800">
              {t("settings.allowWeb")}
            </span>
          </label>
          <p className="text-xs text-amber-800">{t("settings.allowWebRisk")}</p>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3">
            <input
              type="checkbox"
              checked={allowCode}
              onChange={(event) => void setAllowCode(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm font-medium text-gray-800">
              {t("settings.allowCode")}
            </span>
          </label>
          <p className="text-xs text-amber-800">{t("settings.allowCodeRisk")}</p>
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-gray-700"
            htmlFor="rb-web-search-provider"
          >
            {t("settings.webSearchProvider")}
          </label>
          <select
            id="rb-web-search-provider"
            value={webSearchProvider}
            onChange={(event) =>
              void setWebSearchProvider(event.target.value as WebSearchProvider)
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            {...NO_AUTOFILL_INPUT_PROPS}
          >
            {WEB_SEARCH_PROVIDER_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`settings.webSearchProvider.${value}`)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-gray-500">
            {t("settings.webSearchProviderHint")}
          </span>
        </div>

        {webSearchProvider === "tavily" ? (
          <div>
            <label
              className="mb-1 block text-sm font-medium text-gray-700"
              htmlFor="rb-tavily-api-key"
            >
              {t("settings.tavilyApiKey")}
            </label>
            <input
              id="rb-tavily-api-key"
              type="text"
              name="rb-tavily-api-key"
              value={tavilyApiKey}
              onChange={(event) => void setTavilyApiKey(event.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 [-webkit-text-security:disc] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              {...NO_AUTOFILL_INPUT_PROPS}
            />
            <span className="mt-1 block text-xs text-gray-500">
              {t("settings.tavilyApiKeyHint")}
            </span>
          </div>
        ) : (
          <div>
            <label
              className="mb-1 block text-sm font-medium text-gray-700"
              htmlFor="rb-perplexity-api-key"
            >
              {t("settings.perplexityApiKey")}
            </label>
            <input
              id="rb-perplexity-api-key"
              type="text"
              name="rb-perplexity-api-key"
              value={perplexityApiKey}
              onChange={(event) => void setPerplexityApiKey(event.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 [-webkit-text-security:disc] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              {...NO_AUTOFILL_INPUT_PROPS}
            />
            <span className="mt-1 block text-xs text-gray-500">
              {t("settings.perplexityApiKeyHint")}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
