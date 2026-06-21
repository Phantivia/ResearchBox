import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePaperData,
  exportData,
  importData,
  listCachedPapers,
  type CachedPaperSummary,
  type ImportResult,
} from "@/db";
import {
  BackupParseError,
  parseBackup,
  serializeBackup,
  type ImportStrategy,
} from "@/core/storage";
import { useTranslation } from "@/i18n";
import { useStorageStore } from "@/store";
import { SETTINGS_SECTION_IDS } from "./sections";

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

type ActionMessage =
  | { state: "idle" }
  | { state: "success"; text: string }
  | { state: "error"; text: string };

export function DataManagementSection() {
  const { t } = useTranslation();
  const { persisted, estimate, loaded, refresh } = useStorageStore();
  const nearQuota = useStorageStore((state) => state.isNearQuota());

  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<ActionMessage>({ state: "idle" });

  const [strategy, setStrategy] = useState<ImportStrategy>("overwrite");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<ActionMessage>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [papers, setPapers] = useState<CachedPaperSummary[]>([]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const reloadPapers = useCallback(async () => {
    setPapers(await listCachedPapers());
  }, []);

  useEffect(() => {
    void reloadPapers();
  }, [reloadPapers]);

  async function handleExport() {
    setExporting(true);
    setExportMessage({ state: "idle" });
    try {
      const backup = await exportData({ includeSecrets });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`researchbox-backup-${stamp}.json`, serializeBackup(backup));
      setExportMessage({ state: "success", text: t("settings.exportDone") });
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setImporting(true);
    setImportMessage({ state: "idle" });
    try {
      const raw = await file.text();
      const backup = parseBackup(raw);
      const result: ImportResult = await importData(backup, strategy);
      setImportMessage({
        state: "success",
        text: t("settings.importDone", {
          papers: result.papers,
          annotations: result.annotations,
          aiSessions: result.aiSessions,
        }),
      });
      await Promise.all([reloadPapers(), refresh()]);
    } catch (error) {
      if (error instanceof BackupParseError) {
        setImportMessage({ state: "error", text: t("settings.importInvalid") });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setImportMessage({
          state: "error",
          text: t("settings.importFailed", { message }),
        });
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleDeletePaper(paper: CachedPaperSummary) {
    const title = paper.title || paper.arxivId;
    if (!window.confirm(t("settings.deletePaperDataConfirm", { title }))) {
      return;
    }

    const key = `${paper.arxivId}:${paper.version}`;
    setDeletingKey(key);
    try {
      await deletePaperData(paper.arxivId, paper.version);
      await Promise.all([reloadPapers(), refresh()]);
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <section
      id={SETTINGS_SECTION_IDS.dataManagement}
      className="scroll-mt-4 mt-8 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
    >
      <h2 className="mb-4 text-lg font-semibold text-[var(--rb-text-primary)]">
        {t("settings.dataManagement")}
      </h2>

      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">
              {t("settings.persistence")}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                persisted
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {loaded
                ? persisted
                  ? t("settings.persistenceGranted")
                  : t("settings.persistenceDenied")
                : "…"}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">{t("settings.persistenceHint")}</p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <span className="text-sm font-medium text-gray-800">
            {t("settings.storageUsage")}
          </span>
          {estimate && estimate.quota > 0 ? (
            <>
              <p className="mt-1 text-sm text-gray-700">
                {t("settings.storageUsageValue", {
                  used: formatBytes(estimate.usage),
                  total: formatBytes(estimate.quota),
                  percent: Math.round(estimate.percent * 100),
                })}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full ${
                    nearQuota ? "bg-red-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(estimate.percent * 100, 100)}%` }}
                />
              </div>
              {nearQuota && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {t("settings.storageWarning")}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              {t("settings.storageUsageUnknown")}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-[var(--rb-text-primary)]">
            {t("settings.exportBackup")}
          </h3>
          <p className="mt-1 text-sm text-gray-600">{t("settings.exportBackupHint")}</p>
          <label className="mt-3 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={(event) => setIncludeSecrets(event.target.checked)}
            />
            <span className="text-sm text-gray-800">
              {t("settings.exportIncludeSecrets")}
            </span>
          </label>
          {includeSecrets && (
            <p
              className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="alert"
            >
              {t("settings.exportIncludeSecretsWarning")}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="mt-3 rounded-lg bg-[var(--rb-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? t("settings.exporting") : t("settings.exportBackup")}
          </button>
          {exportMessage.state === "success" && (
            <p className="mt-2 text-sm text-green-700" role="status">
              {exportMessage.text}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-[var(--rb-text-primary)]">
            {t("settings.importBackup")}
          </h3>
          <p className="mt-1 text-sm text-gray-600">{t("settings.importBackupHint")}</p>

          <fieldset className="mt-3">
            <legend className="mb-2 text-sm font-medium text-gray-700">
              {t("settings.importStrategy")}
            </legend>
            <div className="space-y-2">
              {(["overwrite", "skip"] as const).map((value) => (
                <label key={value} className="flex cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="importStrategy"
                    checked={strategy === value}
                    onChange={() => setStrategy(value)}
                  />
                  <span className="text-sm text-gray-800">
                    {value === "overwrite"
                      ? t("settings.importStrategyOverwrite")
                      : t("settings.importStrategySkip")}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportFile(event)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? t("settings.importing") : t("settings.importChooseFile")}
          </button>
          {importMessage.state === "success" && (
            <p className="mt-2 text-sm text-green-700" role="status">
              {importMessage.text}
            </p>
          )}
          {importMessage.state === "error" && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {importMessage.text}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-[var(--rb-text-primary)]">
            {t("settings.paperCleanup")}
          </h3>
          <p className="mt-1 text-sm text-gray-600">{t("settings.paperCleanupHint")}</p>
          {papers.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              {t("settings.paperCleanupEmpty")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {papers.map((paper) => {
                const key = `${paper.arxivId}:${paper.version}`;
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-800">
                        {paper.title || paper.arxivId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {paper.arxivId} ·{" "}
                        {t("settings.paperVersionLabel", { version: paper.version })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeletePaper(paper)}
                      disabled={deletingKey === key}
                      className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t("settings.deletePaperData")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
