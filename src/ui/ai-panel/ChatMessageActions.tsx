import { useEffect, useRef, useState, type ReactNode } from "react";

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
}

function ActionButton({ label, onClick, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--rb-text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--rb-border)_55%,transparent)] hover:text-[var(--rb-text-primary)]"
    >
      {children}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

interface CopyActionButtonProps {
  label: string;
  successLabel: string;
  onCopy: () => void | Promise<boolean>;
}

function CopyActionButton({ label, successLabel, onCopy }: CopyActionButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [hintKey, setHintKey] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    void (async () => {
      const copied = await onCopy();
      if (!copied) {
        return;
      }
      setHintKey((key) => key + 1);
      setShowSuccess(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        setShowSuccess(false);
        hideTimerRef.current = null;
      }, 1400);
    })();
  };

  return (
    <div className="relative inline-flex items-center">
      <ActionButton label={label} onClick={handleClick}>
        <CopyIcon />
      </ActionButton>
      {showSuccess ? (
        <span
          key={hintKey}
          role="status"
          aria-live="polite"
          className="rb-copy-hint absolute top-full z-10 mt-0.5 whitespace-nowrap text-[11px] leading-none text-[var(--rb-text-secondary)]"
        >
          {successLabel}
        </span>
      ) : null}
    </div>
  );
}

export interface ChatMessageActionsProps {
  align: "start" | "end";
  copyLabel: string;
  copySuccessLabel: string;
  retryLabel: string;
  editLabel?: string;
  variant: "user" | "assistant";
  onCopy: () => void | Promise<boolean>;
  onRetry: () => void;
  onEdit?: () => void;
}

export function ChatMessageActions({
  align,
  copyLabel,
  copySuccessLabel,
  retryLabel,
  editLabel,
  variant,
  onCopy,
  onRetry,
  onEdit,
}: ChatMessageActionsProps) {
  const alignClass = align === "end" ? "justify-end" : "justify-start";

  const retryButton = (
    <ActionButton key="retry" label={retryLabel} onClick={onRetry}>
      <RetryIcon />
    </ActionButton>
  );
  const copyButton = (
    <CopyActionButton
      key="copy"
      label={copyLabel}
      successLabel={copySuccessLabel}
      onCopy={onCopy}
    />
  );
  const editButton =
    onEdit && editLabel ? (
      <ActionButton key="edit" label={editLabel} onClick={onEdit}>
        <EditIcon />
      </ActionButton>
    ) : null;

  const buttons =
    variant === "user"
      ? [retryButton, editButton, copyButton].filter(Boolean)
      : [copyButton, retryButton];

  return (
    <div
      className={`relative mt-2.5 flex min-h-7 items-center gap-1 overflow-visible opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${alignClass}`}
    >
      {buttons}
    </div>
  );
}
