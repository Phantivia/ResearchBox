import type { ReactNode } from "react";

export interface MessageBubbleProps {
  children: ReactNode;
}

export function MessageBubble({ children }: MessageBubbleProps) {
  return (
    <div className="flex w-full justify-end">
      <div
        className="max-w-[min(100%,42rem)] rounded-xl bg-[color-mix(in_srgb,var(--rb-primary)_20%,var(--rb-page-bg))] px-4 py-3 text-[var(--rb-text-primary)] shadow-sm"
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
