import type { KeyboardEvent } from "react";

export interface UserOcrResultPanelProps {
  label: string;
  emptyLabel: string;
  text: string;
  editable?: boolean;
  disabled?: boolean;
  onTextChange?: (text: string) => void;
}

export function UserOcrResultPanel({
  label,
  emptyLabel,
  text,
  editable = false,
  disabled = false,
  onTextChange,
}: UserOcrResultPanelProps) {
  const trimmed = text.trim();
  const displayText = trimmed.length > 0 ? text : emptyLabel;
  const isEmpty = trimmed.length === 0;

  if (editable) {
    return (
      <div className="mt-2 w-full rounded-lg border border-[color-mix(in_srgb,var(--rb-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--rb-page-bg)_88%,var(--rb-card-bg))] px-3 py-2">
        <p className="mb-1 text-xs font-medium text-[var(--rb-text-secondary)]">{label}</p>
        <textarea
          value={text}
          onChange={(event) => onTextChange?.(event.target.value)}
          disabled={disabled}
          rows={2}
          placeholder={emptyLabel}
          className="block w-full resize-y border-0 bg-transparent text-sm leading-relaxed text-[var(--rb-text-primary)] placeholder:text-[var(--rb-text-secondary)] focus:outline-none disabled:opacity-60"
          style={{ minHeight: "2.5rem", maxHeight: "12rem" }}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-[color-mix(in_srgb,var(--rb-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--rb-page-bg)_88%,var(--rb-card-bg))] px-3 py-2">
      <p className="mb-1 text-xs font-medium text-[var(--rb-text-secondary)]">{label}</p>
      <p
        className={`whitespace-pre-wrap text-sm leading-relaxed ${
          isEmpty ? "text-[var(--rb-text-secondary)] italic" : "text-[var(--rb-text-primary)]"
        }`}
      >
        {displayText}
      </p>
    </div>
  );
}

export function UserOcrImagePreview({
  src,
  alt,
  editable = false,
  removeLabel,
  disabled = false,
  onRemove,
}: {
  src: string;
  alt: string;
  editable?: boolean;
  removeLabel?: string;
  disabled?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative inline-flex max-w-full justify-end">
      <img
        src={src}
        alt={alt}
        className="max-h-48 max-w-full rounded-lg border border-[var(--rb-border)] object-contain"
      />
      {editable && onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          disabled={disabled}
          onClick={onRemove}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function handleEditableTextareaEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
  canSubmit: boolean,
  submitting: boolean,
  onSubmit: () => void,
) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (canSubmit && !submitting) {
      onSubmit();
    }
  }
}
