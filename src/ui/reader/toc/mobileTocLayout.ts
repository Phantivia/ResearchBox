export const MOBILE_TOC_ITEM_MIN_HEIGHT = 52;
export const MOBILE_TOC_LINE_EXTRA = 22;
export const MOBILE_TOC_MAX_LINES = 3;

export function mobileTocItemHeight(title: string, level: number): number {
  const indentFactor = Math.max(0, level - 1);
  const charsPerLine = Math.max(10, 20 - indentFactor * 2);
  const lines = Math.min(
    MOBILE_TOC_MAX_LINES,
    Math.max(1, Math.ceil(title.length / charsPerLine)),
  );
  return MOBILE_TOC_ITEM_MIN_HEIGHT + (lines - 1) * MOBILE_TOC_LINE_EXTRA;
}

export function mobileTocHeights(
  entries: ReadonlyArray<{ title: string; level: number }>,
): number[] {
  return entries.map((entry) => mobileTocItemHeight(entry.title, entry.level));
}

export function mobileTocOffsets(heights: readonly number[]): number[] {
  let acc = 0;
  return heights.map((height) => {
    const offset = acc;
    acc += height;
    return offset;
  });
}

export function mobileTocFloatFromScrollTop(
  scrollTop: number,
  heights: readonly number[],
): number {
  if (heights.length === 0) {
    return 0;
  }
  let acc = 0;
  for (let i = 0; i < heights.length; i += 1) {
    const height = heights[i]!;
    if (scrollTop < acc + height) {
      return i + (scrollTop - acc) / height;
    }
    acc += height;
  }
  return heights.length - 1;
}

export function mobileTocScrollTopForIndex(
  index: number,
  heights: readonly number[],
): number {
  if (heights.length === 0) {
    return 0;
  }
  const clamped = Math.min(Math.max(0, index), heights.length - 1);
  return mobileTocOffsets(heights)[clamped] ?? 0;
}
