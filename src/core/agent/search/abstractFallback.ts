import { cleanArxivHtml } from "@/core/cleaner/clean";
import { fetchPaperHtml } from "@/core/fetcher/fetchPaper";
import type { AcademicHit } from "./types";

export type FillMissingAbstractsDeps = {
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  concurrency?: number;
};

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index]!, index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function fetchAbstractFromArxivHtml(
  arxivId: string,
  deps: FillMissingAbstractsDeps,
): Promise<string> {
  try {
    const { html, source, resolvedUrl } = await fetchPaperHtml(arxivId, null, {
      fetchFn: deps.fetchFn,
      cacheImages: false,
    });
    const cleaned = cleanArxivHtml(html, source, resolvedUrl);
    return cleaned.abstract.trim();
  } catch {
    return "";
  }
}

export async function fillMissingAbstracts(
  hits: AcademicHit[],
  deps: FillMissingAbstractsDeps = {},
): Promise<AcademicHit[]> {
  if (hits.length === 0) {
    return hits;
  }

  const concurrency = deps.concurrency ?? 4;
  const updated = await mapLimit(hits, concurrency, async (hit) => {
    if (hit.abstract.trim().length > 0) {
      return hit;
    }

    if (deps.signal?.aborted) {
      return hit;
    }

    const abstract = await fetchAbstractFromArxivHtml(hit.arxivId, deps);
    if (!abstract) {
      return hit;
    }

    return { ...hit, abstract };
  });

  return updated;
}
