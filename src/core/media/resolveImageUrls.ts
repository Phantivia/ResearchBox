const CORRUPTED_ARXIV_IMAGE =
  /^https:\/\/(arxiv\.org|ar5iv\.org)\/html\/[^/]+\.(?:png|jpe?g|gif|svg|webp)$/i;

const ARXIV_ID_SEGMENT =
  /^(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-zA-Z][a-zA-Z0-9\-]*(?:\.[A-Z]{2,})?\/\d{7}(?:v\d+)?)$/;

const MALFORMED_ARXIV_IMAGE =
  /^https:\/\/(arxiv\.org|ar5iv\.org)\/html\/([^/]+)\/([^/]+)\/(.+)$/i;

function defaultDomParser(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function absolutizeUrl(value: string, base: string): string | null {
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
}

function pageOrigin(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return null;
  }
}

/**
 * 新版 arXiv HTML 图片常用「{idWithVersion}/xN.png」相对 /html/ 根目录，
 * 不能按 pageUrl 解析（会拼成 …/2602.19128/2602.19128v2/x1.png 等 404）。
 */
function resolveVersionPrefixedRelativePath(src: string, pageUrl: string): string | null {
  if (src.startsWith("/") || /^https?:\/\//i.test(src)) return null;

  const slash = src.indexOf("/");
  if (slash <= 0) return null;

  const idSegment = src.slice(0, slash);
  if (!ARXIV_ID_SEGMENT.test(idSegment)) return null;

  const origin = pageOrigin(pageUrl);
  if (!origin) return null;

  return `${origin}/html/${src}`;
}

/** 修复已错误 absolutize 的多余 id 段（含缓存 IR 里的历史错误 URL）。 */
function fixMalformedArxivImageUrl(src: string): string | null {
  const match = src.match(MALFORMED_ARXIV_IMAGE);
  if (!match) return null;

  const host = match[1];
  const seg1 = match[2];
  const seg2 = match[3];
  const rest = match[4];
  if (!host || !seg1 || !seg2 || !rest) return null;
  if (!ARXIV_ID_SEGMENT.test(seg2)) return null;
  if (seg2 === seg1 || seg2.startsWith(`${seg1}v`)) {
    return `https://${host}/html/${seg2}/${rest}`;
  }

  return null;
}

export function resolvePaperImageUrl(src: string, pageUrl: string): string {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  const versionPrefixed = resolveVersionPrefixedRelativePath(trimmed, pageUrl);
  if (versionPrefixed) return versionPrefixed;

  const malformedAbsolute = fixMalformedArxivImageUrl(trimmed);
  if (malformedAbsolute) return malformedAbsolute;

  if (CORRUPTED_ARXIV_IMAGE.test(trimmed)) {
    const filename = trimmed.split("/").pop();
    if (!filename) return trimmed;
    return absolutizeUrl(filename, pageUrl) ?? trimmed;
  }

  if (trimmed.startsWith("/") || !/^https?:\/\//i.test(trimmed)) {
    return absolutizeUrl(trimmed, pageUrl) ?? trimmed;
  }

  return trimmed;
}

function rewriteImageSrc(src: string, pageUrl: string): string {
  return resolvePaperImageUrl(src, pageUrl);
}

function absolutizeSrcset(srcset: string, pageUrl: string): string {
  const candidates: string[] = [];
  for (const candidate of srcset.split(",")) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const [url, ...descriptors] = trimmed.split(/\s+/);
    if (!url) continue;
    candidates.push([rewriteImageSrc(url, pageUrl), ...descriptors].join(" "));
  }
  return candidates.join(", ");
}

/**
 * 由论文 arxivId + version 构造 HTML 页面 base URL（末尾保留斜杠），
 * 供相对图片路径解析；渲染层对缓存 IR 做兜底改写时使用。
 */
export function buildArxivPaperPageUrl(arxivId: string, version: string): string {
  const idWithVersion = version && version !== "latest" ? `${arxivId}${version}` : arxivId;
  return `https://arxiv.org/html/${idWithVersion}/`;
}

/**
 * arXiv/ar5iv HTML 里图片常为相对路径或根路径（/html/...），在 SPA origin 下会破图。
 * 亦兼容旧版 base 缺尾斜杠产生的错误绝对地址（如 https://arxiv.org/html/x1.png）。
 */
export function absolutizeImageUrlsInDocument(doc: Document, pageUrl: string): void {
  if (!absolutizeUrl(".", pageUrl)) return;

  doc.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src")?.trim();
    if (!src) return;
    img.setAttribute("src", rewriteImageSrc(src, pageUrl));
  });

  doc.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    const srcset = el.getAttribute("srcset");
    if (!srcset) return;
    el.setAttribute("srcset", absolutizeSrcset(srcset, pageUrl));
  });
}

export function resolveImageUrlsInHtml(
  html: string,
  pageUrl: string,
  domParser: (html: string) => Document = defaultDomParser,
): string {
  if (!/<img[\s>]/i.test(html) && !/srcset=/i.test(html)) {
    return html;
  }

  const doc = domParser(`<!DOCTYPE html><html><body>${html}</body></html>`);
  absolutizeImageUrlsInDocument(doc, pageUrl);
  return doc.body.innerHTML;
}
