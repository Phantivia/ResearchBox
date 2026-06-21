import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { MathBlock } from "./MathBlock";
import { MathSpotlight } from "./MathSpotlight";

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
