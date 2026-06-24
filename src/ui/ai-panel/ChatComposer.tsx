import { useEffect, useState, type KeyboardEvent } from "react";
import type { ContextTokenBreakdown } from "@/core/agent/contextSize";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";
import { ApprovalSheet } from "./ApprovalSheet";
import { BoxSwitch } from "./BoxSwitch";
import { ContextDetailSheet, ContextMeter } from "./ContextMeter";

export interface ChatComposerProps {
  disabled: boolean;
  contextWindow: number;
  contextBreakdown: ContextTokenBreakdown;
  onSend: (text: string) => void;
  onStop?: () => void;
  stopping?: boolean;
}

export function ChatComposer({
  disabled,
  contextWindow,
  contextBreakdown,
  onSend,
  onStop,
  stopping = false,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [contextDetailOpen, setContextDetailOpen] = useState(false);
  const hasPendingApproval = useAgentStore((state) => state.pendingApprovals.length > 0);

  useEffect(() => {
    if (hasPendingApproval && contextDetailOpen) {
      setContextDetailOpen(false);
    }
  }, [contextDetailOpen, hasPendingApproval]);

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

  const canSend = draft.trim().length > 0 && !disabled;
  const showStop = Boolean(onStop) && disabled;

  return (
    <div className="relative shrink-0 border-t border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-3 sm:p-4">
      <ApprovalSheet />
      <ContextDetailSheet
        breakdown={contextBreakdown}
        contextWindow={contextWindow}
        open={contextDetailOpen}
        onClose={() => setContextDetailOpen(false)}
      />
      <div className="flex items-end gap-2 sm:gap-3">
        <BoxSwitch />
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
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
      </div>
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
