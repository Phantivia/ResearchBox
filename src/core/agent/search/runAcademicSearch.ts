import type { AppSettings } from "@/core/settings/schema";
import { fillMissingAbstracts } from "./abstractFallback";
import { openAlexAdapter } from "./openAlex";
import { semanticScholarAdapter } from "./semanticScholar";
import type { AcademicHit } from "./types";

export type RunAcademicSearchInput = {
  query: string;
  limit: number;
  settings: Pick<AppSettings, "semanticScholarApiKey" | "openAlexApiKey">;
  signal: AbortSignal;
  fetchFn?: typeof fetch;
};

function dedupeByArxivId(hits: AcademicHit[]): AcademicHit[] {
  const seen = new Set<string>();
  const deduped: AcademicHit[] = [];

  for (const hit of hits) {
    if (seen.has(hit.arxivId)) {
      continue;
    }
    seen.add(hit.arxivId);
    deduped.push(hit);
  }

  return deduped;
}

export async function runAcademicSearch(
  input: RunAcademicSearchInput,
): Promise<AcademicHit[]> {
  const { query, limit, settings, signal, fetchFn } = input;
  const trimmedQuery = query.trim();
  if (!trimmedQuery || limit <= 0) {
    return [];
  }

  const hits: AcademicHit[] = [];
  const openAlexApiKey = settings.openAlexApiKey.trim();
  const semanticScholarApiKey = settings.semanticScholarApiKey.trim();

  let openAlexHits: AcademicHit[] = [];
  if (openAlexApiKey) {
    openAlexHits = await openAlexAdapter.search(trimmedQuery, {
      limit,
      apiKey: openAlexApiKey,
      signal,
      fetchFn,
    });
    hits.push(...openAlexHits);
  }

  if (!openAlexApiKey || openAlexHits.length === 0) {
    const semanticScholarHits = await semanticScholarAdapter.search(trimmedQuery, {
      limit,
      apiKey: semanticScholarApiKey || undefined,
      signal,
      fetchFn,
    });
    hits.push(...semanticScholarHits);
  }

  const deduped = dedupeByArxivId(hits).slice(0, limit);

  try {
    return await fillMissingAbstracts(deduped, { fetchFn, signal });
  } catch {
    return deduped;
  }
}
