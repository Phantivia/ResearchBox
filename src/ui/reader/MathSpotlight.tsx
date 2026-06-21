import { useEffect } from "react";
import { createPortal } from "react-dom";
import { MathBlock } from "./MathBlock";

export interface MathSpotlightProps {
  tex: string;
  onClose: () => void;
}

// 点击单行展示公式后，从顶栏滑下的放大卡片：以更大字号居中展示，遮罩或 Esc 关闭。
export function MathSpotlight({ tex, onClose }: MathSpotlightProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="放大的公式"
      data-testid="math-spotlight"
    >
      <div
        className="rb-spotlight-card w-full max-w-3xl rounded-b-2xl border border-t-0 border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-6 py-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-[var(--rb-text-secondary)]">
            公式
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_50%,transparent)]"
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-x-auto py-2 text-[1.6em] leading-relaxed">
          <MathBlock tex={tex} display />
        </div>
      </div>
    </div>,
    document.body,
  );
}
