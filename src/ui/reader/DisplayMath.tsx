import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { MathBlock } from "./MathBlock";

// 公式缩到此比例仍放不下时，停止缩小并交给容器横向滚动，避免字号过小不可读。
const MIN_SCALE = 0.55;

export interface DisplayMathProps {
  tex: string;
  display: boolean;
}

export function DisplayMath({ tex, display }: DisplayMathProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // 用 font-size 等比缩放（而非 transform），布局盒随之收缩，
  // 横向滚动与缩放可以正确共存。
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      content.style.fontSize = "";
      const natural = content.scrollWidth;
      const available = container.clientWidth;
      if (natural > available + 1 && available > 0) {
        const scale = Math.max(MIN_SCALE, available / natural);
        content.style.fontSize = `${scale}em`;
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tex, display]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className="rb-display-math overflow-x-auto"
        role="button"
        tabIndex={0}
        title="点击放大查看公式"
        aria-label="放大查看公式"
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      >
        <div ref={contentRef} className="rb-display-math__content inline-block w-max max-w-none">
          <MathBlock tex={tex} display={display} />
        </div>
      </div>
      {open && <MathSpotlight tex={tex} onClose={() => setOpen(false)} />}
    </>
  );
}

function MathSpotlight({ tex, onClose }: { tex: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey as never);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey as never);
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
