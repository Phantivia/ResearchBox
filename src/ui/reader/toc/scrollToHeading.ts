// 顶部预留量：移动端有 sticky 顶栏 (h-14 = 56px)，留些余量避免标题贴边。
const SCROLL_OFFSET = 76;

// 与 useActiveHeading / TocRail 刻度尺拖动一致：激活线在视口高度 30% 处。
export const TOC_ACTIVE_LINE_RATIO = 0.3;

// 移动端目录拖拽预览：标题对齐视口高度 10% 处。
export const MOBILE_TOC_ACTIVE_LINE_RATIO = 0.1;

export function escapeBlockId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/["\\]/g, "\\$&");
}

export function findHeadingElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-block-id="${escapeBlockId(id)}"]`,
  );
}

export function collectHeadingTops(ids: string[]): number[] {
  return ids.map((id) => {
    const element = findHeadingElement(id);
    return element
      ? element.getBoundingClientRect().top + window.scrollY
      : Number.NaN;
  });
}

/** 按 section 浮点索引在相邻 heading 间插值滚动正文（与 PC 刻度尺拖动一致）。 */
export function scrollBodyToHeadingFloat(
  value: number,
  tops: number[],
  behavior: ScrollBehavior = "auto",
): void {
  const i = Math.floor(value);
  const frac = value - i;
  const top = tops[i] ?? 0;
  const next = tops[i + 1];
  const docTop =
    next !== undefined && !Number.isNaN(next) && !Number.isNaN(top)
      ? top + frac * (next - top)
      : top;
  const line = window.innerHeight * TOC_ACTIVE_LINE_RATIO;
  window.scrollTo({ top: Math.max(0, docTop - line), behavior });
}

export function scrollToHeadingAtLineRatio(
  id: string,
  ratio: number,
  behavior: ScrollBehavior = "auto",
): void {
  const element = findHeadingElement(id);
  if (!element) {
    return;
  }
  const line = window.innerHeight * ratio;
  const top = element.getBoundingClientRect().top + window.scrollY - line;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

/** 按 section 索引离散跳转正文（不插值），用于移动端目录拖拽。 */
export function scrollToHeadingIndex(
  index: number,
  tops: number[],
  ratio: number = MOBILE_TOC_ACTIVE_LINE_RATIO,
  behavior: ScrollBehavior = "auto",
): void {
  const docTop = tops[index];
  if (docTop === undefined || Number.isNaN(docTop)) {
    return;
  }
  const line = window.innerHeight * ratio;
  window.scrollTo({ top: Math.max(0, docTop - line), behavior });
}

/**
 * 将页面平滑滚动到指定 heading block，顶部预留顶栏高度。
 * 整个文档随 window 滚动，因此直接操作 window。
 */
export function scrollToHeading(
  id: string,
  behavior: ScrollBehavior = "smooth",
): void {
  const element = findHeadingElement(id);
  if (!element) {
    return;
  }
  const top = element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior });
}
