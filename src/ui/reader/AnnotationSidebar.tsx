import { useState, type CSSProperties } from "react";
import Markdown from "react-markdown";
import type { Annotation } from "@/core/annotation";
import { useTranslation } from "@/i18n";

export interface AnnotationSidebarProps {
  annotations: Annotation[];
  onJump: (annotation: Annotation) => void;
  onDelete: (id: number) => void;
  onSaveNote: (id: number, note: string) => void;
  className?: string;
  style?: CSSProperties;
}

function NoteEditor({
  annotation,
  onSave,
}: {
  annotation: Annotation;
  onSave: (note: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(annotation.note ?? "");
  const [editing, setEditing] = useState(!annotation.note);

  if (!editing) {
    return (
      <div className="mt-2 space-y-2">
        <div className="prose prose-sm max-w-none text-gray-700">
          <Markdown>{annotation.note}</Markdown>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-[var(--rb-primary)] hover:underline"
        >
          {t("annotation.editNote")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder={t("annotation.notePlaceholder")}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          className="rounded bg-[var(--rb-primary)] px-2 py-1 text-xs font-medium text-white hover:bg-[var(--rb-primary-hover)]"
        >
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(annotation.note ?? "");
            setEditing(false);
          }}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

export function AnnotationSidebar({
  annotations,
  onJump,
  onDelete,
  onSaveNote,
  className,
  style,
}: AnnotationSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside
      className={[
        "min-w-0 overflow-y-auto border border-[var(--rb-border)] bg-[var(--rb-page-bg)] p-4",
        className ?? "",
      ].join(" ")}
      style={style}
      data-testid="annotation-sidebar"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--rb-text-secondary)]">
        {t("annotation.title", { count: annotations.length })}
      </h2>

      {annotations.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--rb-text-secondary)]">{t("annotation.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {annotations.map((annotation) => (
            <li
              key={annotation.id}
              className="rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-3 text-sm shadow-sm"
            >
              <button
                type="button"
                onClick={() => onJump(annotation)}
                className="block w-full text-left font-medium text-[var(--rb-text-primary)] hover:text-[var(--rb-primary)]"
              >
                “{annotation.quote}”
              </button>
              <NoteEditor
                annotation={annotation}
                onSave={(note) => {
                  if (annotation.id !== undefined) {
                    onSaveNote(annotation.id, note);
                  }
                }}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (annotation.id !== undefined) {
                      onDelete(annotation.id);
                    }
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  {t("annotation.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
