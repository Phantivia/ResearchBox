export type AcademicHit = {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  source: "semantic-scholar" | "openalex";
  externalId?: string;
};

export type AcademicSearchOptions = {
  limit: number;
  apiKey?: string;
  signal: AbortSignal;
  fetchFn?: typeof fetch;
};

export type AcademicSearchAdapter = {
  name: string;
  search: (query: string, opts: AcademicSearchOptions) => Promise<AcademicHit[]>;
};
