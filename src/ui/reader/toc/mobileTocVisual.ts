/** 选中项对齐线：略低于视口中线，为正文留出更多可视区域。 */
export const MOBILE_TOC_CENTER_RATIO = 0.63;

const NEAR_SCALE = 0.92;
/** 相邻项约 92% 宽；较陡版回调约 30% 后 d≈4 仍 faint 可见。 */
const SCALE_BASE = 0.62;
const OPACITY_BASE = 0.62;
/** 两侧项在基础衰减上乘以此系数，整体不透明度抬高 50%。 */
const OPACITY_SIDE_BOOST = 1.5;
/** 中心线以上的项更快淡出，进一步让出上方正文空间。 */
const UPPER_OPACITY_BOOST = 1.45;
const UPPER_SCALE_BOOST = 1.32;
const VISIBILITY_FLOOR = 0.04;

function effectiveDistance(distance: number, upperBoost: number): number {
  const magnitude = Math.abs(distance);
  const boost = distance < 0 ? upperBoost : 1;
  return magnitude * boost;
}

/** 相邻项约 92% 宽，远端渐隐但不截断成平台。 */
export function mobileTocPanelScale(distance: number, isCentered: boolean): number {
  if (isCentered) {
    return 1;
  }
  const d = effectiveDistance(distance, UPPER_SCALE_BOOST);
  if (d <= 1) {
    return 1 - (1 - NEAR_SCALE) * d;
  }
  const scale = NEAR_SCALE * SCALE_BASE ** (d - 1);
  return scale < VISIBILITY_FLOOR ? 0 : scale;
}

/** 上方项 opacity 衰减更快；整体比上一版缓和约 30%。 */
export function mobileTocPanelOpacity(distance: number, isCentered: boolean): number {
  if (isCentered) {
    return 1;
  }
  const d = effectiveDistance(distance, UPPER_OPACITY_BOOST);
  const opacity = Math.min(1, OPACITY_BASE ** d * OPACITY_SIDE_BOOST);
  return opacity < VISIBILITY_FLOOR ? 0 : opacity;
}

export function mobileTocCenterOffsetCss(itemHeight: number): string {
  return `calc(${MOBILE_TOC_CENTER_RATIO * 100}% - ${itemHeight / 2}px)`;
}
