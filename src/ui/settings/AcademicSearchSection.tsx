import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/store";
import { SETTINGS_SECTION_IDS } from "./sections";

const NO_AUTOFILL_INPUT_PROPS = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-form-type": "other",
} as const;

export function AcademicSearchSection() {
  const { t } = useTranslation();
  const semanticScholarApiKey = useSettingsStore(
    (state) => state.semanticScholarApiKey,
  );
  const openAlexApiKey = useSettingsStore((state) => state.openAlexApiKey);
  const setSemanticScholarApiKey = useSettingsStore(
    (state) => state.setSemanticScholarApiKey,
  );
  const setOpenAlexApiKey = useSettingsStore((state) => state.setOpenAlexApiKey);

  return (
    <section
      id={SETTINGS_SECTION_IDS.academicSearch}
      className="scroll-mt-4 mb-8 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
    >
      <h2 className="mb-4 text-lg font-semibold text-[var(--rb-text-primary)]">
        {t("settings.academicSearch")}
      </h2>
      <div className="space-y-4">
        <div>
          <label
            className="mb-1 block text-sm font-medium text-gray-700"
            htmlFor="rb-semantic-scholar-api-key"
          >
            {t("settings.semanticScholarApiKey")}
          </label>
          <input
            id="rb-semantic-scholar-api-key"
            type="text"
            name="rb-semantic-scholar-api-key"
            value={semanticScholarApiKey}
            onChange={(event) =>
              void setSemanticScholarApiKey(event.target.value)
            }
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 [-webkit-text-security:disc] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            {...NO_AUTOFILL_INPUT_PROPS}
          />
          <span className="mt-1 block text-xs text-gray-500">
            {t("settings.semanticScholarApiKeyHint")}
          </span>
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-gray-700"
            htmlFor="rb-openalex-api-key"
          >
            {t("settings.openAlexApiKey")}
          </label>
          <input
            id="rb-openalex-api-key"
            type="text"
            name="rb-openalex-api-key"
            value={openAlexApiKey}
            onChange={(event) => void setOpenAlexApiKey(event.target.value)}
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 [-webkit-text-security:disc] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            {...NO_AUTOFILL_INPUT_PROPS}
          />
          <span className="mt-1 block text-xs text-gray-500">
            {t("settings.openAlexApiKeyHint")}
          </span>
        </div>
      </div>
    </section>
  );
}
