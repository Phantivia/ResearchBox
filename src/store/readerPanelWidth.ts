import {
  ANNOTATION_PANEL_WIDTH_KEY,
  clampAnnotationPanelWidth,
  DEFAULT_ANNOTATION_PANEL_WIDTH,
} from "@/core/reader";

export { ANNOTATION_PANEL_WIDTH_KEY, clampAnnotationPanelWidth };

export function readStoredAnnotationPanelWidth(): number {
  try {
    const raw = localStorage.getItem(ANNOTATION_PANEL_WIDTH_KEY);
    if (raw) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        return clampAnnotationPanelWidth(parsed);
      }
    }
  } catch {
    // localStorage may be unavailable in private mode.
  }
  return DEFAULT_ANNOTATION_PANEL_WIDTH;
}

export function persistAnnotationPanelWidth(width: number): void {
  try {
    localStorage.setItem(ANNOTATION_PANEL_WIDTH_KEY, String(width));
  } catch {
    // localStorage may be unavailable in private mode.
  }
}
