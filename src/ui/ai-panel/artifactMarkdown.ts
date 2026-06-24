export type MarkdownSegment =
  | { kind: "text"; value: string }
  | { kind: "math"; tex: string; display: boolean };

const DISPLAY_MATH_PATTERN = /\$\$([\s\S]+?)\$\$/;
const INLINE_MATH_PATTERN = /\$([^\$\n]+?)\$/;

export function linkifyArtifactCitations(content: string): string {
  return content.replace(/\[([^\[\]\n]+#[^\[\]\n]+)\]/g, (_match, id: string) => {
    return `[${id}](cite:${encodeURIComponent(id)})`;
  });
}

export function splitMarkdownWithMath(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    const displayMatch = DISPLAY_MATH_PATTERN.exec(remaining);
    if (displayMatch && displayMatch.index >= 0) {
      const before = remaining.slice(0, displayMatch.index);
      if (before) {
        segments.push(...splitInlineMath(before));
      }
      segments.push({ kind: "math", tex: displayMatch[1] ?? "", display: true });
      remaining = remaining.slice(displayMatch.index + displayMatch[0].length);
      continue;
    }

    segments.push(...splitInlineMath(remaining));
    break;
  }

  return segments;
}

function splitInlineMath(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const inlineMatch = INLINE_MATH_PATTERN.exec(remaining);
    if (inlineMatch && inlineMatch.index >= 0) {
      const before = remaining.slice(0, inlineMatch.index);
      if (before) {
        segments.push({ kind: "text", value: before });
      }
      segments.push({ kind: "math", tex: inlineMatch[1] ?? "", display: false });
      remaining = remaining.slice(inlineMatch.index + inlineMatch[0].length);
      continue;
    }

    if (remaining) {
      segments.push({ kind: "text", value: remaining });
    }
    break;
  }

  return segments;
}
