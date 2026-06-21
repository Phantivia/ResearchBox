const CORRUPTED_ARXIV_IMAGE =
  /^https:\/\/(arxiv\.org|ar5iv\.org)\/html\/[^/]+\.(?:png|jpe?g|gif|svg|webp)$/i;

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

function shouldRewriteImageSrc(src: string): boolean {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;
  if (CORRUPTED_ARXIV_IMAGE.test(src)) return true;
  if (src.startsWith("/")) return true;
  if (!/^https?:\/\//i.test(src)) return true;
  return false;
}

function rewriteImageSrc(src: string, pageUrl: string): string {
  if (!shouldRewriteImageSrc(src)) return src;

  if (CORRUPTED_ARXIV_IMAGE.test(src)) {
    const filename = src.split("/").pop();
    if (!filename) return src;
    return absolutizeUrl(filename, pageUrl) ?? src;
  }

  return absolutizeUrl(src, pageUrl) ?? src;
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
