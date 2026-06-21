import {
  PAPER_IMAGES_CACHE_NAME,
  PAPER_IMAGE_CACHE_MAX_ENTRIES,
} from "./constants";

export type PaperImageCacheDeps = {
  fetchFn?: typeof fetch;
  caches?: CacheStorage;
  domParser?: (html: string) => Document;
};

const IMAGE_URL_PATTERN =
  /^https:\/\/(arxiv\.org|ar5iv\.org|.*\.arxiv\.org)\/.+/i;

function defaultDomParser(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function extractPaperImageUrls(
  html: string,
  pageUrl: string,
  domParser: (html: string) => Document = defaultDomParser,
): string[] {
  const doc = domParser(html);
  const base = new URL(pageUrl);
  const urls = new Set<string>();

  for (const img of doc.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src")?.trim();
    if (!src) continue;
    try {
      const absolute = new URL(src, base).href;
      if (IMAGE_URL_PATTERN.test(absolute)) {
        urls.add(absolute);
      }
    } catch {
      // skip malformed URLs
    }
  }

  for (const source of doc.querySelectorAll("picture source[srcset], img[srcset]")) {
    const srcset = source.getAttribute("srcset");
    if (!srcset) continue;
    for (const candidate of srcset.split(",")) {
      const part = candidate.trim().split(/\s+/)[0];
      if (!part) continue;
      try {
        const absolute = new URL(part, base).href;
        if (IMAGE_URL_PATTERN.test(absolute)) {
          urls.add(absolute);
        }
      } catch {
        // skip malformed URLs
      }
    }
  }

  return [...urls];
}

/**
 * 删除某篇论文的全部缓存图片。
 * 图片以原始 URL 为键存于 Cache API，URL 路径含 arxivId（如 /html/2401.12345/x1.png），
 * 据此匹配并删除该论文相关条目。返回删除的条目数。
 */
export async function deletePaperImages(
  arxivId: string,
  deps?: Pick<PaperImageCacheDeps, "caches">,
): Promise<number> {
  const cacheStorage = deps?.caches ?? globalThis.caches;
  if (!cacheStorage) {
    return 0;
  }

  const cache = await cacheStorage.open(PAPER_IMAGES_CACHE_NAME);
  const keys = await cache.keys();
  const matches = keys.filter((request) => request.url.includes(arxivId));
  await Promise.all(matches.map((request) => cache.delete(request)));
  return matches.length;
}

async function trimCacheEntries(cache: Cache, maxEntries: number): Promise<void> {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) {
    return;
  }

  const overflow = keys.length - maxEntries;
  await Promise.all(keys.slice(0, overflow).map((request) => cache.delete(request)));
}

export async function cachePaperImages(
  html: string,
  pageUrl: string,
  deps?: PaperImageCacheDeps,
): Promise<number> {
  const cacheStorage = deps?.caches ?? globalThis.caches;
  if (!cacheStorage) {
    return 0;
  }

  const urls = extractPaperImageUrls(
    html,
    pageUrl,
    deps?.domParser ?? defaultDomParser,
  );
  if (urls.length === 0) {
    return 0;
  }

  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const cache = await cacheStorage.open(PAPER_IMAGES_CACHE_NAME);
  let stored = 0;

  await Promise.allSettled(
    urls.map(async (url) => {
      const existing = await cache.match(url);
      if (existing) {
        return;
      }

      const response = await fetchFn(url);
      if (!response.ok) {
        return;
      }

      await cache.put(url, response.clone());
      stored += 1;
    }),
  );

  await trimCacheEntries(cache, PAPER_IMAGE_CACHE_MAX_ENTRIES);
  return stored;
}
