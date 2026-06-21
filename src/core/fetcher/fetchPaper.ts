import { cachePaperImages } from "@/core/cache";

export class NoHtmlVersionError extends Error {
  constructor(public readonly arxivId: string) {
    super(`No HTML version available for ${arxivId}`);
    this.name = "NoHtmlVersionError";
  }
}

export type FetchPaperDeps = {
  fetchFn?: typeof fetch;
  caches?: CacheStorage;
  cacheImages?: boolean;
};

export async function fetchPaperHtml(
  id: string,
  version: string | null,
  deps?: FetchPaperDeps,
): Promise<{ html: string; source: "arxiv" | "ar5iv"; resolvedUrl: string }> {
  const doFetch = deps?.fetchFn ?? globalThis.fetch;
  const shouldCacheImages = deps?.cacheImages ?? true;

  // Primary: arxiv.org/html/{id}{version}
  // 末尾斜杠必须保留：图片相对路径以此为 base 解析（new URL("x1.png", base)），
  // 缺斜杠会把 id 当作"文件名"被替换掉，导致绝对地址错误、图片显示为破图。
  const idWithVersion = version ? `${id}${version}` : id;
  const arxivUrl = `https://arxiv.org/html/${idWithVersion}/`;

  try {
    const res = await doFetch(arxivUrl);
    if (res.ok) {
      const html = await res.text();
      if (shouldCacheImages) {
        await cachePaperImages(html, arxivUrl, {
          fetchFn: doFetch,
          caches: deps?.caches,
        });
      }
      return { html, source: "arxiv", resolvedUrl: arxivUrl };
    }
  } catch {
    // Primary source network error — fall through to ar5iv
  }

  // Fallback: ar5iv.org/html/{id} (ar5iv only serves v1, always use bare id)
  const ar5ivUrl = `https://ar5iv.org/html/${id}/`;

  try {
    const res = await doFetch(ar5ivUrl);
    if (res.ok) {
      const html = await res.text();
      if (shouldCacheImages) {
        await cachePaperImages(html, ar5ivUrl, {
          fetchFn: doFetch,
          caches: deps?.caches,
        });
      }
      return { html, source: "ar5iv", resolvedUrl: ar5ivUrl };
    }
  } catch {
    // Fallback source also failed — throw below
  }

  throw new NoHtmlVersionError(id);
}
