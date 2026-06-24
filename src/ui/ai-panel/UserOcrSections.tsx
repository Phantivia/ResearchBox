import { useState, type KeyboardEvent } from "react";

export interface UserOcrResultPanelProps {
  label: string;
  emptyLabel: string;
  text: string;
  editable?: boolean;
  disabled?: boolean;
  pending?: boolean;
  runningLabel?: string;
  collapsible?: boolean;
  onTextChange?: (text: string) => void;
}

function MagnifyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function OcrRunningDots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="inline-block h-1 w-1 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${index * 200}ms` }}
        />
      ))}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const rowClass =
  "inline-flex max-w-full items-center gap-1.5 text-xs text-[var(--rb-text-secondary)]";

const bubbleClass =
  "w-full max-w-[min(100%,28rem)] rounded-lg border border-[color-mix(in_srgb,var(--rb-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--rb-page-bg)_88%,var(--rb-card-bg))] px-3 py-2";

function OcrResultBubble({
  text,
  isEmpty,
  emptyLabel,
}: {
  text: string;
  isEmpty: boolean;
  emptyLabel: string;
}) {
  const displayText = isEmpty ? emptyLabel : text;
  return (
    <div className={bubbleClass}>
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

export function UserOcrResultPanel({
  label,
  emptyLabel,
  text,
  editable = false,
  disabled = false,
  pending = false,
  runningLabel = "",
  collapsible = false,
  onTextChange,
}: UserOcrResultPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();
  const isEmpty = trimmed.length === 0;

  if (editable) {
    return (
      <div className="mt-1.5 flex w-full flex-col items-end gap-1">
        <span className={rowClass}>
          <MagnifyIcon />
          <span>{label}</span>
        </span>
        <div className={bubbleClass}>
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
      </div>
    );
  }

  if (pending) {
    return (
      <div className="mt-1.5 flex w-full justify-end">
        <span className={rowClass}>
          <MagnifyIcon />
          <span>{runningLabel || label}</span>
          <OcrRunningDots />
        </span>
      </div>
    );
  }

  if (collapsible) {
    return (
      <div className="mt-1.5 flex w-full flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className={`${rowClass} rounded-sm transition-colors hover:text-[var(--rb-text-primary)]`}
          aria-expanded={expanded}
        >
          <MagnifyIcon />
          <span>{label}</span>
          <ChevronIcon expanded={expanded} />
        </button>
        {expanded ? (
          <OcrResultBubble text={text} isEmpty={isEmpty} emptyLabel={emptyLabel} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex w-full flex-col items-end gap-1">
      <span className={rowClass}>
        <MagnifyIcon />
        <span>{label}</span>
      </span>
      <OcrResultBubble text={text} isEmpty={isEmpty} emptyLabel={emptyLabel} />
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
