const DISPLAY_ENV_PATTERN =
  /\\begin\{(align\*?|aligned|equation\*?|gather\*?|multline|split|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array)\}/;

export function shouldFlowInlineMath(tex: string, display: boolean): boolean {
  if (!display) return true;

  const normalized = tex.trim();
  if (normalized.length === 0) return true;
  if (DISPLAY_ENV_PATTERN.test(normalized)) return false;
  if (/\\\\/.test(normalized)) return false;

  return normalized.length <= 48;
}

export function mathDisplayMode(tex: string, display: boolean): boolean {
  if (!display) return false;
  return !shouldFlowInlineMath(tex, display);
}
