import { parseArxivId } from "@/core/fetcher/parseId";
import type { AcademicHit, AcademicSearchAdapter } from "./types";

const SS_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
const SS_FIELDS = "title,authors,abstract,externalIds";

type SsAuthor = { name?: string };
type SsPaper = {
  paperId?: string;
  title?: string;
  abstract?: string | null;
  authors?: SsAuthor[];
  externalIds?: { ArXiv?: string };
};

type SsSearchResponse = {
  data?: SsPaper[];
};

function parseArxivIdFromExternalIds(externalIds: SsPaper["externalIds"]): string | null {
  const raw = externalIds?.ArXiv;
  if (!raw) {
    return null;
  }
  const parsed = parseArxivId(raw);
  return parsed?.id ?? null;
}

function mapPaper(paper: SsPaper): AcademicHit | null {
  const arxivId = parseArxivIdFromExternalIds(paper.externalIds);
  if (!arxivId || !paper.title) {
    return null;
  }

  const authors =
    paper.authors
      ?.map((author) => author.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];

  return {
    arxivId,
    title: paper.title,
    authors,
    abstract: paper.abstract?.trim() ?? "",
    source: "semantic-scholar",
    externalId: paper.paperId,
  };
}

async function searchSemanticScholar(
  query: string,
  opts: {
    limit: number;
    apiKey?: string;
    signal: AbortSignal;
    fetchFn?: typeof fetch;
  },
): Promise<AcademicHit[]> {
  const doFetch = opts.fetchFn ?? globalThis.fetch;

  try {
    const url = new URL(SS_SEARCH_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("fields", SS_FIELDS);
    url.searchParams.set("limit", String(Math.min(Math.max(opts.limit, 1), 100)));

    const headers: Record<string, string> = {};
    const apiKey = opts.apiKey?.trim();
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await doFetch(url, { headers, signal: opts.signal });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as SsSearchResponse;
    const papers = payload.data ?? [];

    return papers
      .map(mapPaper)
      .filter((hit): hit is AcademicHit => hit !== null)
      .slice(0, opts.limit);
  } catch {
    return [];
  }
}

export const semanticScholarAdapter: AcademicSearchAdapter = {
  name: "semantic-scholar",
  search: searchSemanticScholar,
};
