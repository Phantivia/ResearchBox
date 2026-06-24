import { parseArxivId } from "@/core/fetcher/parseId";
import type { AcademicHit, AcademicSearchAdapter } from "./types";

const OPENALEX_WORKS_URL = "https://api.openalex.org/works";
const OPENALEX_SELECT =
  "id,display_name,authorships,abstract_inverted_index,ids,doi";

export type AbstractInvertedIndex = Record<string, number[]>;

type OpenAlexAuthorship = {
  author?: { display_name?: string };
  raw_author_name?: string;
};

type OpenAlexWork = {
  id?: string;
  display_name?: string;
  doi?: string | null;
  ids?: Record<string, string | number | null>;
  authorships?: OpenAlexAuthorship[];
  abstract_inverted_index?: AbstractInvertedIndex | null;
};

type OpenAlexSearchResponse = {
  results?: OpenAlexWork[];
};

export function reconstructAbstract(
  invertedIndex: AbstractInvertedIndex | null | undefined,
): string {
  if (!invertedIndex) {
    return "";
  }

  const tokens: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      tokens.push([position, word]);
    }
  }

  if (tokens.length === 0) {
    return "";
  }

  tokens.sort((left, right) => left[0] - right[0]);
  return tokens.map(([, word]) => word).join(" ");
}

function parseArxivIdFromDoiValue(doi: string): string | null {
  const parsed = parseArxivId(doi);
  if (parsed) {
    return parsed.id;
  }

  const match = doi.match(/10\.48550\/(?:arXiv|arxiv)\.([^/?#\s]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return parseArxivId(match[1])?.id ?? match[1].replace(/v\d+$/i, "");
}

export function parseArxivIdFromOpenAlexIds(
  ids: OpenAlexWork["ids"],
  doi?: string | null,
): string | null {
  if (ids) {
    const arxivRaw = ids.arxiv;
    if (typeof arxivRaw === "string") {
      const parsed = parseArxivId(arxivRaw);
      if (parsed) {
        return parsed.id;
      }
    }

    const idsDoi = ids.doi;
    if (typeof idsDoi === "string") {
      const fromIdsDoi = parseArxivIdFromDoiValue(idsDoi);
      if (fromIdsDoi) {
        return fromIdsDoi;
      }
    }
  }

  if (typeof doi === "string") {
    return parseArxivIdFromDoiValue(doi);
  }

  return null;
}

function mapWork(work: OpenAlexWork): AcademicHit | null {
  const arxivId = parseArxivIdFromOpenAlexIds(work.ids, work.doi);
  if (!arxivId || !work.display_name) {
    return null;
  }

  const authors =
    work.authorships
      ?.map(
        (authorship) =>
          authorship.author?.display_name?.trim() ??
          authorship.raw_author_name?.trim() ??
          "",
      )
      .filter((name) => name.length > 0) ?? [];

  return {
    arxivId,
    title: work.display_name,
    authors,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    source: "openalex",
    externalId: work.id,
  };
}

async function searchOpenAlex(
  query: string,
  opts: {
    limit: number;
    apiKey?: string;
    signal: AbortSignal;
    fetchFn?: typeof fetch;
  },
): Promise<AcademicHit[]> {
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) {
    return [];
  }

  const doFetch = opts.fetchFn ?? globalThis.fetch;

  try {
    const url = new URL(OPENALEX_WORKS_URL);
    url.searchParams.set("search", query);
    url.searchParams.set("select", OPENALEX_SELECT);
    url.searchParams.set("per_page", String(Math.min(Math.max(opts.limit, 1), 100)));
    url.searchParams.set("api_key", apiKey);

    const response = await doFetch(url, { signal: opts.signal });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as OpenAlexSearchResponse;
    const works = payload.results ?? [];

    return works
      .map(mapWork)
      .filter((hit): hit is AcademicHit => hit !== null)
      .slice(0, opts.limit);
  } catch {
    return [];
  }
}

export const openAlexAdapter: AcademicSearchAdapter = {
  name: "openalex",
  search: searchOpenAlex,
};
