import type { ReactNode } from "react";
import { MarkdownContent } from "./MarkdownContent";

export interface MessageBubbleProps {
  role: "user" | "assistant";
  children: ReactNode;
}

export function MessageBubble({ role, children }: MessageBubbleProps) {
  const isUser = role === "user";
  const text = typeof children === "string" ? children : String(children);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[min(100%,42rem)] rounded-xl px-4 py-3 shadow-sm",
          isUser
            ? "bg-[var(--rb-primary)] text-white"
            : "border border-[var(--rb-border)] bg-[var(--rb-card-bg)] text-[var(--rb-text-primary)]",
        ].join(" ")}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{children}</div>
        ) : (
          <MarkdownContent content={text} />
        )}
      </div>
    </div>
  );
}
