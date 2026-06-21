import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Paper } from "@/core/paper";
import type { Project } from "@/core/project";
import { listPaperEntries } from "@/db";
import { useTranslation } from "@/i18n";
import { useProjectStore } from "@/store";
import { BrandCreditsTrigger, MiniLogo } from "@/ui/brand";
import { PageFooter } from "@/ui/shell/PageFooter";

const PREVIEW_COUNT = 3;

function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

export function Welcome() {
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const { projects, loaded, load, create, rename, remove } = useProjectStore();
  const [name, setName] = useState("");
  const [paperPreviews, setPaperPreviews] = useState<
    Record<string, { papers: Paper[]; total: number }>
  >({});

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded || projects.length === 0) {
      setPaperPreviews({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project) => {
          const papers = await listPaperEntries(project.id);
          return [
            project.id,
            { papers: papers.slice(0, PREVIEW_COUNT), total: papers.length },
          ] as const;
        }),
      );

      if (!cancelled) {
        setPaperPreviews(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loaded, projects]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const project = await create(trimmed);
    setName("");
    navigate(`/p/${encodeURIComponent(project.id)}/paper-box`);
  }

  return (
    <>
    <main className="relative z-10 min-h-screen overflow-x-clip">
      <div className="mx-auto min-w-0 max-w-3xl px-4 py-10">
        <header className="relative mb-6">
          <div className="flex items-start gap-4">
            <BrandCreditsTrigger className="shrink-0 rounded-lg transition-opacity hover:opacity-80">
              <MiniLogo
                className="h-14 w-14 text-[var(--rb-primary)]"
                aria-hidden
              />
            </BrandCreditsTrigger>
            <div className="min-w-0 pt-1">
              <h1 className="text-2xl font-bold text-[var(--rb-text-primary)]">
                {t("project.title")}
              </h1>
              <p className="mt-1 text-sm text-[var(--rb-text-secondary)]">
                {t("project.subtitle")}
              </p>
            </div>
          </div>
        </header>

        <form onSubmit={handleCreate} className="mb-8 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("project.namePlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-[var(--rb-card-bg)] px-4 py-2.5 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-[var(--rb-primary)] px-5 py-2.5 font-medium text-white shadow-sm hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {t("project.newProject")}
          </button>
        </form>

        {loaded && projects.length === 0 ? (
          <div className="rb-card-surface rounded-lg border border-dashed border-[var(--rb-border)] px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-[var(--rb-text-primary)]">
              {t("noProject.title")}
            </h2>
            <p className="mt-2 text-sm text-[var(--rb-text-secondary)]">{t("noProject.body")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                locale={locale}
                preview={paperPreviews[project.id]}
                onOpen={() =>
                  navigate(`/p/${encodeURIComponent(project.id)}/paper-box`)
                }
                onRename={(value) => void rename(project.id, value)}
                onRemove={() => {
                  if (
                    window.confirm(
                      t("project.deleteConfirm", { name: project.name }),
                    )
                  ) {
                    void remove(project.id);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
    <PageFooter />
    </>
  );
}

interface ProjectCardProps {
  project: Project;
  locale: string;
  preview?: { papers: Paper[]; total: number };
  onOpen: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}

function ProjectCard({
  project,
  locale,
  preview,
  onOpen,
  onRename,
  onRemove,
}: ProjectCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(trimmed);
    }
    setEditing(false);
  }

  const moreCount =
    preview && preview.total > PREVIEW_COUNT
      ? preview.total - PREVIEW_COUNT
      : 0;

  return (
    <li>
      <div className="rb-card-surface group flex items-start gap-4 rounded-lg border border-[var(--rb-border)] p-4 shadow-sm transition-colors hover:border-blue-300">
        {editing ? (
          <input
            type="text"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commit();
              } else if (event.key === "Escape") {
                setDraft(project.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-blue-300 px-3 py-1.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        ) : (
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <h2 className="truncate text-base font-semibold text-[var(--rb-text-primary)]">
              {project.name}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--rb-text-secondary)]">
              {t("project.createdAt", {
                date: formatDate(project.createdAt, locale),
              })}
            </p>
            {preview && preview.papers.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {preview.papers.map((paper) => (
                  <li
                    key={paper.routeId}
                    className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--rb-text-secondary)]"
                  >
                    <PaperIcon />
                    <span className="truncate">{paper.title || paper.arxivId}</span>
                  </li>
                ))}
                {moreCount > 0 && (
                  <li className="pl-4 text-[11px] text-[var(--rb-text-secondary)]/80">
                    {t("project.morePapers", { count: moreCount })}
                  </li>
                )}
              </ul>
            )}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg bg-[var(--rb-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--rb-primary-hover)]"
          >
            {t("project.open")}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(project.name);
              setEditing(true);
            }}
            aria-label={t("project.rename")}
            title={t("project.rename")}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("project.delete")}
            title={t("project.delete")}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </li>
  );
}

function PaperIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 shrink-0 opacity-60"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
