import { useEffect } from "react";
import type { TocEntry } from "@/core/toc";
import { useReaderTocStore } from "@/store";
import { findHeadingElement } from "./scrollToHeading";

// 激活线：视口高度的 30% 处。最后一个越过该线的 heading 即为当前 section。
const ACTIVE_LINE_RATIO = 0.3;

/**
 * 滚动监听式 scrollspy：依据 heading 在视口中的位置推导当前 section，
 * 写入 readerTocStore.activeId。PC 刻度尺与移动端顶栏共用该状态。
 */
export function useActiveHeading(entries: TocEntry[]): void {
  const setActiveId = useReaderTocStore((state) => state.setActiveId);

  useEffect(() => {
    if (entries.length === 0) {
      return;
    }

    const ids = entries.map((entry) => entry.id);
    let frame = 0;

    const compute = () => {
      frame = 0;
      const line = window.innerHeight * ACTIVE_LINE_RATIO;
      let current: string | null = null;

      for (const id of ids) {
        const element = findHeadingElement(id);
        if (!element) {
          continue;
        }
        if (element.getBoundingClientRect().top - line <= 0) {
          current = id;
        } else {
          break;
        }
      }

      setActiveId(current ?? ids[0] ?? null);
    };

    const onScroll = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(compute);
      }
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [entries, setActiveId]);
}
