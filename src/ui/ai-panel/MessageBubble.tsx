import type { ReactNode } from "react";
import { ChatMessageActions } from "./ChatMessageActions";

export interface UserMessageShellProps {
  copyLabel: string;
  copySuccessLabel: string;
  retryLabel: string;
  editLabel: string;
  showActions?: boolean;
  onCopy: () => void;
  onRetry: () => void;
  onEdit: () => void;
  children: ReactNode;
}

export function UserMessageShell({
  copyLabel,
  copySuccessLabel,
  retryLabel,
  editLabel,
  showActions = true,
  onCopy,
  onRetry,
  onEdit,
  children,
}: UserMessageShellProps) {
  return (
    <div className="group relative flex w-full flex-col items-end">
      {children}
      {showActions ? (
        <ChatMessageActions
          align="end"
          variant="user"
          copyLabel={copyLabel}
          copySuccessLabel={copySuccessLabel}
          retryLabel={retryLabel}
          editLabel={editLabel}
          onCopy={onCopy}
          onRetry={onRetry}
          onEdit={onEdit}
        />
      ) : null}
    </div>
  );
}

export interface MessageBubbleProps {
  children: ReactNode;
}

export function MessageBubble({ children }: MessageBubbleProps) {
  return (
    <div
      className="max-w-[min(100%,42rem)] rounded-xl bg-[color-mix(in_srgb,var(--rb-primary)_20%,var(--rb-page-bg))] px-4 py-3 text-[var(--rb-text-primary)] shadow-sm"
    >
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{children}</div>
    </div>
  );
}
