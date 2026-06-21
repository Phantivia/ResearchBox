// New-style arXiv ID: YYMM.nnnnn (4-5 digit suffix), optional version
const NEW_STYLE_RE = /^(\d{4}\.\d{4,5})(v(\d+))?$/;
const NEW_STYLE_SCAN_RE = /\d{4}\.\d{4,5}(?:v\d+)?/;

// Old-style arXiv ID: subject-class/YYMMnnn, optional version
// subject-class examples: math.GT, hep-ph, cond-mat, cs.AI, astro-ph.CO
const OLD_STYLE_RE = /^([a-zA-Z][a-zA-Z0-9\-]*(?:\.[A-Z]{2,})?\/\d{7})(v(\d+))?$/;
const OLD_STYLE_SCAN_RE =
  /[a-zA-Z][a-zA-Z0-9\-]*(?:\.[A-Z]{2,})?\/\d{7}(?:v\d+)?/;

// arXiv URL path patterns: /abs/, /pdf/, /html/
const ARXIV_URL_RE = /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf|html)\//;

function parseIdPart(idPart: string): { id: string; version: string | null } | null {
  const newMatch = idPart.match(NEW_STYLE_RE);
  if (newMatch) {
    return { id: newMatch[1]!, version: newMatch[3] ? `v${newMatch[3]}` : null };
  }

  const oldMatch = idPart.match(OLD_STYLE_RE);
  if (oldMatch) {
    return { id: oldMatch[1]!, version: oldMatch[3] ? `v${oldMatch[3]}` : null };
  }

  return null;
}

function findFirstArxivIdCandidate(input: string): string | null {
  let earliest: { index: number; match: string } | null = null;

  for (const pattern of [NEW_STYLE_SCAN_RE, OLD_STYLE_SCAN_RE]) {
    const match = pattern.exec(input);
    if (match && (earliest === null || match.index < earliest.index)) {
      earliest = { index: match.index, match: match[0] };
    }
  }

  return earliest?.match ?? null;
}

export function parseArxivId(
  input: string,
): { id: string; version: string | null } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let idPart: string;

  if (ARXIV_URL_RE.test(trimmed)) {
    const afterPrefix = trimmed.replace(ARXIV_URL_RE, "");
    idPart = afterPrefix.split(/[?#]/)[0]!;
    idPart = idPart.replace(/\.pdf$/, "");
  } else {
    idPart = trimmed.split(/[?#]/)[0]!;
  }

  return parseIdPart(idPart);
}

/**
 * 从用户粘贴的文本中提取第一个 arXiv ID（整段解析失败时回退到正则扫描）。
 * 用于 HTML 导入输入框，容忍 URL 缺前缀、被截断等情况。
 */
export function extractArxivIdFromInput(
  input: string,
): { id: string; version: string | null } | null {
  const strict = parseArxivId(input);
  if (strict) {
    return strict;
  }

  const candidate = findFirstArxivIdCandidate(input.trim());
  if (!candidate) {
    return null;
  }

  return parseIdPart(candidate);
}
