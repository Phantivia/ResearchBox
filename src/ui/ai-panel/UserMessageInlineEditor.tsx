import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { PendingImageAttachment } from "./imageAttachments";
import {
  handleEditableTextareaEnter,
  UserOcrImagePreview,
  UserOcrResultPanel,
} from "./UserOcrSections";

export interface UserMessageInlineEditorProps {
  text: string;
  images: PendingImageAttachment[];
  ocrTexts: string[];
  ocrResultLabel: string;
  ocrEmptyLabel: string;
  removeImageLabel: string;
  cancelLabel: string;
  submitLabel: string;
  submitting?: boolean;
  onTextChange: (text: string) => void;
  onOcrTextChange: (index: number, text: string) => void;
  onRemoveImage: (id: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function EditorActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--rb-text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--rb-border)_55%,transparent)] hover:text-[var(--rb-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function UserMessageInlineEditor({
  text,
  images,
  ocrTexts,
  ocrResultLabel,
  ocrEmptyLabel,
  removeImageLabel,
  cancelLabel,
  submitLabel,
  submitting = false,
  onTextChange,
  onOcrTextChange,
  onRemoveImage,
  onCancel,
  onSubmit,
}: UserMessageInlineEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = text.trim().length > 0 || images.length > 0;
  const showOcrEditors = images.length > 0 && ocrTexts.length === images.length;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    handleEditableTextareaEnter(event, canSubmit, submitting, onSubmit);
  };

  return (
    <div className="flex w-full max-w-[min(100%,42rem)] flex-col items-end gap-2">
      <div className="w-full rounded-xl border border-[color-mix(in_srgb,var(--rb-primary)_45%,var(--rb-border))] bg-[color-mix(in_srgb,var(--rb-primary)_20%,var(--rb-page-bg))] px-4 py-3 shadow-sm">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            onTextChange(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          rows={1}
          className="block w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-[var(--rb-text-primary)] focus:outline-none disabled:opacity-60"
          style={{ minHeight: "1.5rem", maxHeight: "12rem" }}
        />
      </div>

      {images.length > 0 ? (
        <div className="flex w-full flex-col items-end gap-3">
          {images.map((image, index) => (
            <div key={image.id} className="flex w-full flex-col items-end">
              <UserOcrImagePreview
                src={image.previewUrl}
                alt={image.name ?? ""}
                editable
                removeLabel={removeImageLabel}
                disabled={submitting}
                onRemove={() => onRemoveImage(image.id)}
              />
              {showOcrEditors ? (
                <UserOcrResultPanel
                  label={ocrResultLabel}
                  emptyLabel={ocrEmptyLabel}
                  text={ocrTexts[index] ?? ""}
                  editable
                  disabled={submitting}
                  onTextChange={(value) => onOcrTextChange(index, value)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <EditorActionButton label={cancelLabel} onClick={onCancel} disabled={submitting}>
          <CancelIcon />
        </EditorActionButton>
        <EditorActionButton label={submitLabel} onClick={onSubmit} disabled={submitting || !canSubmit}>
          <SubmitIcon />
        </EditorActionButton>
      </div>
    </div>
  );
}
