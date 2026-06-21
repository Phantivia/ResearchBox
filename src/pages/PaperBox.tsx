import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Paper, PaperStatus } from "@/core/paper";
import { shouldShowPaperStatusBadge } from "@/core/paper";
import { useTranslation } from "@/i18n";
import { usePaperStore, useTranslationJobStore } from "@/store";
import { CurrentProjectLabel } from "@/ui/shell/CurrentProjectLabel";
import { TranslationProgressRing } from "@/ui/reader/TranslationProgressRing";

function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

export function PaperBox() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const { papers, loaded, loadForProject, addInput, remove } = usePaperStore();
  const [addOpen, setAddOpen] = useState(false);
  const [importMode, setImportMode] = useState<"arxiv-html" | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const statusMeta: Record<Exclude<PaperStatus, "ready">, { label: string; className: string }> = {
    processing: {
      label: t("projects.status.processing"),
      className: "bg-blue-50 text-blue-700 ring-blue-200",
    },
    done: {
      label: t("projects.status.done"),
      className: "bg-green-50 text-green-700 ring-green-200",
    },
    error: {
      label: t("projects.status.error"),
      className: "bg-red-50 text-red-700 ring-red-200",
    },
  };

  useEffect(() => {
    if (projectId) {
      void loadForProject(projectId);
    }
  }, [projectId, loadForProject]);

  function resetAdd() {
    setAddOpen(false);
    setImportMode(null);
    setInput("");
    setError(null);
  }

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    const routeId = await addInput(projectId, input);
    if (!routeId) {
      setError(t("projects.invalidInput"));
      return;
    }
    resetAdd();
    navigate(`/p/${encodeURIComponent(projectId)}/paper/${encodeURIComponent(routeId)}`);
  }

  return (
    <main className="relative z-10 min-h-screen overflow-x-clip">
      <div className="mx-auto min-w-0 max-w-3xl px-4 py-10">
        <header className="mb-6">
          <CurrentProjectLabel />
          <h1 className="text-2xl font-bold text-[var(--rb-text-primary)]">{t("paperBox.title")}</h1>
          <p className="mt-1 text-sm text-[var(--rb-text-secondary)]">{t("paperBox.subtitle")}</p>
        </header>

        <div className="mb-8">
          {!addOpen ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--rb-primary)] px-5 py-2.5 font-medium text-white shadow-sm hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <PlusIcon />
              {t("paperBox.addPaper")}
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--rb-text-primary)]">
                  {t("paperBox.chooseMethod")}
                </p>
                <button
                  type="button"
                  onClick={resetAdd}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label={t("common.cancel")}
                >
                  <CloseIcon />
                </button>
              </div>

              {importMode === null ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setImportMode("arxiv-html")}
                    className="flex w-full items-center gap-3 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    <DocumentIcon />
                    <span className="text-sm font-medium text-[var(--rb-text-primary)]">
                      {t("paperBox.importArxivHtml")}
                    </span>
                  </button>
                  <p className="px-1 text-xs text-[var(--rb-text-secondary)]">{t("paperBox.moreSoon")}</p>
                </div>
              ) : (
                <form onSubmit={handleImport} className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={input}
                    autoFocus
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={t("projects.inputPlaceholder")}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-[var(--rb-card-bg)] px-4 py-2.5 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-[var(--rb-primary)] px-5 py-2.5 font-medium text-white shadow-sm hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    {t("paperBox.import")}
                  </button>
                </form>
              )}

              {error && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {loaded && papers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-6 py-12 text-center text-[var(--rb-text-secondary)]">
            {t("paperBox.empty")}
          </div>
        ) : (
          <ul className="space-y-3">
            {papers.map((paper) => (
              <PaperCard
                key={paper.routeId}
                paper={paper}
                statusMeta={statusMeta}
                locale={locale}
                onOpen={() =>
                  navigate(
                    `/p/${encodeURIComponent(projectId)}/paper/${encodeURIComponent(paper.routeId)}`,
                  )
                }
                onRemove={() => void remove(projectId, paper.routeId)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

interface PaperCardProps {
  paper: Paper;
  statusMeta: Record<Exclude<PaperStatus, "ready">, { label: string; className: string }>;
  locale: string;
  onOpen: () => void;
  onRemove: () => void;
}

function PaperCard({ paper, statusMeta, locale, onOpen, onRemove }: PaperCardProps) {
  const { t } = useTranslation();
  const translationJob = useTranslationJobStore((state) => state.jobs[paper.routeId]);
  const versionLabel =
    paper.version === "latest" ? t("projects.versionLatest") : paper.version;
  const translationRunning =
    translationJob?.status === "running" && translationJob.totalBlocks > 0;
  const showProgress = paper.status === "processing" && translationRunning;
  const showStatusBadge = shouldShowPaperStatusBadge(paper, translationRunning);
  const status = showStatusBadge ? statusMeta[paper.status as Exclude<PaperStatus, "ready">] : null;

  return (
    <li>
      <div className="group flex items-start gap-4 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-4 shadow-sm transition-colors hover:border-blue-300">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs text-[var(--rb-text-secondary)]">
              {paper.arxivId} · {versionLabel}
            </span>
            {status && (
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.className}`}
              >
                {paper.status === "processing" && !showProgress && (
                  <span
                    className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current"
                    aria-hidden
                  />
                )}
                {status.label}
              </span>
            )}
            {showProgress && (
              <TranslationProgressRing
                completed={translationJob.completedBlocks}
                total={translationJob.totalBlocks}
                size={28}
              />
            )}
          </div>
          <h2 className="mt-2 truncate text-base font-semibold text-[var(--rb-text-primary)]">
            {paper.title || paper.arxivId}
          </h2>
          {paper.authors.length > 0 && (
            <p className="mt-1 truncate text-sm text-[var(--rb-text-secondary)]">
              {paper.authors.join(", ")}
            </p>
          )}
          {paper.status === "error" && paper.error && (
            <p className="mt-1 text-sm text-red-600">{paper.error}</p>
          )}
          <p className="mt-2 text-xs text-[var(--rb-text-secondary)]">
            {t("projects.updatedAt", {
              date: formatDate(paper.updatedAt, locale),
            })}
            {paper.modelUsed && paper.modelUsed !== "none"
              ? ` · ${paper.modelUsed}`
              : ""}
          </p>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("paperBox.deletePaper")}
          className="shrink-0 rounded-lg p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-[var(--rb-primary)]"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
