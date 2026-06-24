import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { ContextTokenBreakdown } from "@/core/agent/contextSize";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { ApprovalSheet } from "./ApprovalSheet";
import { BoxSwitch } from "./BoxSwitch";
import { ContextDetailSheet, ContextMeter } from "./ContextMeter";
import {
  extractImageFilesFromClipboard,
  extractImageFilesFromDataTransfer,
  readImageFiles,
  releaseAttachmentPreviews,
  type PendingImageAttachment,
} from "./imageAttachments";

export type ChatSendPayload = {
  text: string;
  images: PendingImageAttachment[];
};

export interface ChatComposerProps {
  disabled: boolean;
  contextWindow: number;
  contextBreakdown: ContextTokenBreakdown;
  onSend: (payload: ChatSendPayload) => void | Promise<void>;
  onStop?: () => void;
  stopping?: boolean;
  rippleContainerRef?: RefObject<HTMLElement | null>;
}

const MAX_ATTACHMENTS = 10;

export function ChatComposer({
  disabled,
  contextWindow,
  contextBreakdown,
  onSend,
  onStop,
  stopping = false,
  rippleContainerRef,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingImageAttachment[]>([]);
  const [contextDetailOpen, setContextDetailOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const hasPendingApproval = useAgentStore((state) => state.pendingApprovals.length > 0);
  const attachmentInputId = useId();

  useEffect(() => {
    if (hasPendingApproval && contextDetailOpen) {
      setContextDetailOpen(false);
    }
  }, [contextDetailOpen, hasPendingApproval]);

  useEffect(() => {
    return () => {
      releaseAttachmentPreviews(attachmentsRef.current);
    };
  }, []);

  const { refs, floatingStyles, context } = useFloating({
    open: attachMenuOpen,
    onOpenChange: setAttachMenuOpen,
    placement: "top-end",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(attachButtonRef.current);
  }, [refs]);

  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const role = useRole(context, { role: "menu" });
  const { getFloatingProps, getItemProps } = useInteractions([dismiss, role]);

  const addAttachments = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        setAttachError(t("agent.attachInvalidType"));
        return;
      }

      setAttachError(null);
      try {
        const next = await readImageFiles(files);
        if (next.length === 0) {
          setAttachError(t("agent.attachInvalidType"));
          return;
        }
        setAttachments((current) => {
          const merged = [...current, ...next];
          if (merged.length <= MAX_ATTACHMENTS) {
            return merged;
          }
          const kept = merged.slice(0, MAX_ATTACHMENTS);
          releaseAttachmentPreviews(merged.slice(MAX_ATTACHMENTS));
          return kept;
        });
      } catch {
        setAttachError(t("agent.attachInvalidType"));
      }
    },
    [t],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target) {
        releaseAttachmentPreviews([target]);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
  }, []);

  const handleSend = () => {
    const trimmed = draft.trim();
    if ((!trimmed && attachments.length === 0) || disabled) {
      return;
    }
    void onSend({ text: trimmed, images: attachments });
    setDraft("");
    releaseAttachmentPreviews(attachments);
    setAttachments([]);
    setAttachError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    handleSend();
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = extractImageFilesFromClipboard(event.clipboardData);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    void addAttachments(files);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDragActive(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (disabled) {
      return;
    }
    void addAttachments(extractImageFilesFromDataTransfer(event.dataTransfer));
  };

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !disabled;
  const showStop = Boolean(onStop) && disabled;

  return (
    <div
      className="relative shrink-0 border-t border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-3 sm:p-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ApprovalSheet />
      <ContextDetailSheet
        breakdown={contextBreakdown}
        contextWindow={contextWindow}
        open={contextDetailOpen}
        onClose={() => setContextDetailOpen(false)}
      />

      {dragActive && !disabled ? (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--rb-primary)] bg-[color-mix(in_srgb,var(--rb-primary)_8%,transparent)] text-sm font-medium text-[var(--rb-primary)]">
          {t("agent.attachDropHint")}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--rb-border)] bg-[var(--rb-page-bg)]"
            >
              <img
                src={attachment.previewUrl}
                alt={attachment.name ?? ""}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={t("agent.attachRemove")}
                title={t("agent.attachRemove")}
                onClick={() => removeAttachment(attachment.id)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {attachError ? (
        <p className="mb-2 text-xs text-red-600" role="alert">
          {attachError}
        </p>
      ) : null}

      <div className="flex items-end gap-2 sm:gap-3">
        <BoxSwitch rippleContainerRef={rippleContainerRef} />
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          rows={2}
          placeholder={t("agent.inputPlaceholder")}
          className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-[var(--rb-border)] bg-[var(--rb-page-bg)] px-3 py-2 text-sm text-[var(--rb-text-primary)] placeholder:text-[var(--rb-text-secondary)] focus:border-[var(--rb-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_25%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <ContextMeter
          breakdown={contextBreakdown}
          contextWindow={contextWindow}
          open={contextDetailOpen}
          onOpenChange={setContextDetailOpen}
        />
        {showStop ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            aria-label={stopping ? t("agent.stopping") : t("agent.stop")}
            title={stopping ? t("agent.stopping") : t("agent.stop")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--rb-text-primary)] text-[var(--rb-card-bg)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-text-primary)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label={t("agent.send")}
            title={t("agent.send")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--rb-primary)] text-white hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon />
          </button>
        )}
        <button
          ref={attachButtonRef}
          type="button"
          disabled={disabled}
          aria-label={t("agent.attach")}
          aria-expanded={attachMenuOpen}
          aria-haspopup="menu"
          title={t("agent.attach")}
          onClick={() => setAttachMenuOpen((open) => !open)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--rb-border)] bg-[var(--rb-page-bg)] text-[var(--rb-text-primary)] hover:bg-[color-mix(in_srgb,var(--rb-text-primary)_6%,transparent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon />
        </button>
      </div>

      <input
        ref={fileInputRef}
        id={attachmentInputId}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files ? [...event.target.files] : [];
          event.target.value = "";
          setAttachMenuOpen(false);
          void addAttachments(files);
        }}
      />

      {attachMenuOpen ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 min-w-[11rem] overflow-hidden rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              {...getItemProps({
                onClick: () => {
                  setAttachMenuOpen(false);
                  fileInputRef.current?.click();
                },
              })}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--rb-text-primary)] hover:bg-[color-mix(in_srgb,var(--rb-text-primary)_6%,transparent)]"
            >
              <ImageIcon />
              {t("agent.attachImage")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled
              {...getItemProps()}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[var(--rb-text-secondary)] disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-2">
                <FileIcon />
                {t("agent.attachFile")}
              </span>
              <span className="text-xs">{t("agent.attachFileSoon")}</span>
            </button>
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
      <path d="M12 19V5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m5 12 7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="m7 17 4-4 3 3 3-4 4 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
      <path d="M8 4h7l3 3v13H8z" strokeLinejoin="round" />
      <path d="M15 4v3h3" strokeLinejoin="round" />
    </svg>
  );
}
