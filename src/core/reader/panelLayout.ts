export const TOC_RAIL_WIDTH = 180;
export const DEFAULT_ANNOTATION_PANEL_WIDTH = 300;
export const MIN_ANNOTATION_PANEL_WIDTH = 220;
export const MAX_ANNOTATION_PANEL_WIDTH = 520;
export const ANNOTATION_PANEL_WIDTH_KEY = "rb-reader-annotation-width";

export function clampAnnotationPanelWidth(width: number): number {
  return Math.min(
    MAX_ANNOTATION_PANEL_WIDTH,
    Math.max(MIN_ANNOTATION_PANEL_WIDTH, width),
  );
}

export function readerRightPanelWidth(annotationPanelWidth: number): number {
  return annotationPanelWidth + TOC_RAIL_WIDTH;
}
