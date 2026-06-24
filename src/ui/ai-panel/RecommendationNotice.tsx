import { useEffect, useState } from "react";

export interface RecommendationNoticeProps {
  label: string;
}

export function RecommendationNotice({ label }: RecommendationNoticeProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={[
        "my-4 flex items-center gap-3 px-2 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      ].join(" ")}
    >
      <div className="h-px flex-1 bg-[var(--rb-border)]" aria-hidden />
      <span className="max-w-md shrink-0 text-center text-xs leading-snug text-[var(--rb-text-secondary)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--rb-border)]" aria-hidden />
    </div>
  );
}
