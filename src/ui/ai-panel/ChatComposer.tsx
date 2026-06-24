import { useState, type KeyboardEvent } from "react";

export interface ChatComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function ChatComposer({ disabled, onSend }: ChatComposerProps) {
  const [draft, setDraft] = useState("");

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend(trimmed);
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    handleSend();
  };

  return (
    <div className="border-t border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-3 sm:p-4">
      <div className="flex items-end gap-2 sm:gap-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={2}
          placeholder="输入消息…"
          className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-[var(--rb-border)] bg-[var(--rb-page-bg)] px-3 py-2 text-sm text-[var(--rb-text-primary)] placeholder:text-[var(--rb-text-secondary)] focus:border-[var(--rb-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_25%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || draft.trim().length === 0}
          className="shrink-0 rounded-lg bg-[var(--rb-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--rb-primary-hover)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          发送
        </button>
      </div>
      <p className="mt-1.5 hidden text-[11px] text-[var(--rb-text-secondary)] sm:block">
        Enter 发送，Shift+Enter 换行
      </p>
    </div>
  );
}
