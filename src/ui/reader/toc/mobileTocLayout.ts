export const MOBILE_TOC_ITEM_HEIGHT = 52;

export function mobileTocHeights(entries: ReadonlyArray<unknown>): number[] {
  return entries.map(() => MOBILE_TOC_ITEM_HEIGHT);
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
