import type { StoredOpenRouterModelMeta } from "@/core/llm";
import { useTranslation } from "@/i18n";

type OpenRouterMetaPanelProps = {
  meta: StoredOpenRouterModelMeta | null | undefined;
  status: "idle" | "loading" | "success" | "not_found" | "error";
  errorMessage?: string;
};

function formatModalities(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

export function OpenRouterMetaPanel({
  meta,
  status,
  errorMessage,
}: OpenRouterMetaPanelProps) {
  const { t } = useTranslation();

  if (status === "idle") {
    return null;
  }

  if (status === "loading") {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {t("settings.openRouterMeta.loading")}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        <p className="font-medium">{t("settings.openRouterMeta.sourceLabel")}</p>
        <p className="mt-1">
          {t("settings.openRouterMeta.fetchFailed", {
            message: errorMessage ?? "Unknown error",
          })}
        </p>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-medium">{t("settings.openRouterMeta.sourceLabel")}</p>
        <p className="mt-1">{t("settings.openRouterMeta.notFound")}</p>
      </div>
    );
  }

  if (!meta) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">
          {t("settings.openRouterMeta.sourceLabel")}
        </p>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
          OpenRouter
        </span>
      </div>

      <dl className="mt-3 space-y-2">
        <div>
          <dt className="font-medium text-slate-800">
            {t("settings.openRouterMeta.displayName")}
          </dt>
          <dd className="mt-0.5">{meta.name}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-800">
            {t("settings.openRouterMeta.inputModalities")}
          </dt>
          <dd className="mt-0.5">{formatModalities(meta.inputModalities)}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-800">
            {t("settings.openRouterMeta.outputModalities")}
          </dt>
          <dd className="mt-0.5">{formatModalities(meta.outputModalities)}</dd>
        </div>
        {meta.description && (
          <div>
            <dt className="font-medium text-slate-800">
              {t("settings.openRouterMeta.description")}
            </dt>
            <dd className="mt-0.5 line-clamp-3 text-slate-600">{meta.description}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
