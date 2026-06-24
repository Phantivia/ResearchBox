import type { WebSearchProvider } from "@/core/settings/schema";

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchAdapterOptions = {
  maxResults: number;
  apiKey: string;
  signal: AbortSignal;
  fetchFn?: typeof fetch;
};

export type RunWebSearchInput = {
  query: string;
  maxResults: number;
  provider: WebSearchProvider;
  tavilyApiKey: string;
  perplexityApiKey: string;
  signal: AbortSignal;
  fetchFn?: typeof fetch;
};

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search";
const WEB_SEARCH_TIMEOUT_MS = 30_000;

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
};

type TavilySearchResponse = {
  results?: TavilyResult[];
};

type PerplexityResult = {
  title?: string;
  url?: string;
  snippet?: string;
};

type PerplexitySearchResponse = {
  results?: PerplexityResult[];
};

function mergeAbortSignals(primary: AbortSignal, timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.any([primary, AbortSignal.timeout(timeoutMs)]);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (primary.aborted) {
    controller.abort();
    return controller.signal;
  }

  primary.addEventListener("abort", onAbort, { once: true });

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      primary.removeEventListener("abort", onAbort);
    },
    { once: true },
  );

  return controller.signal;
}

function mapTavilyHit(result: TavilyResult): WebHit | null {
  const title = result.title?.trim();
  const url = result.url?.trim();
  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    snippet: result.content?.trim() ?? "",
  };
}

function mapPerplexityHit(result: PerplexityResult): WebHit | null {
  const title = result.title?.trim();
  const url = result.url?.trim();
  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    snippet: result.snippet?.trim() ?? "",
  };
}

export async function tavilySearch(
  query: string,
  opts: WebSearchAdapterOptions,
): Promise<WebHit[]> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) {
    return [];
  }

  const doFetch = opts.fetchFn ?? globalThis.fetch;
  const signal = mergeAbortSignals(opts.signal, WEB_SEARCH_TIMEOUT_MS);

  try {
    const response = await doFetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(Math.max(opts.maxResults, 1), 20),
      }),
      signal,
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as TavilySearchResponse;
    return (payload.results ?? [])
      .map(mapTavilyHit)
      .filter((hit): hit is WebHit => hit !== null)
      .slice(0, opts.maxResults);
  } catch {
    return [];
  }
}

export async function perplexitySearch(
  query: string,
  opts: WebSearchAdapterOptions,
): Promise<WebHit[]> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) {
    return [];
  }

  const doFetch = opts.fetchFn ?? globalThis.fetch;
  const signal = mergeAbortSignals(opts.signal, WEB_SEARCH_TIMEOUT_MS);

  try {
    const response = await doFetch(PERPLEXITY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(Math.max(opts.maxResults, 1), 20),
      }),
      signal,
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as PerplexitySearchResponse;
    return (payload.results ?? [])
      .map(mapPerplexityHit)
      .filter((hit): hit is WebHit => hit !== null)
      .slice(0, opts.maxResults);
  } catch {
    return [];
  }
}

export async function runWebSearch(input: RunWebSearchInput): Promise<WebHit[]> {
  const trimmedQuery = input.query.trim();
  if (!trimmedQuery || input.maxResults <= 0) {
    return [];
  }

  const adapterOpts: WebSearchAdapterOptions = {
    maxResults: input.maxResults,
    apiKey:
      input.provider === "tavily"
        ? input.tavilyApiKey
        : input.perplexityApiKey,
    signal: input.signal,
    fetchFn: input.fetchFn,
  };

  if (input.provider === "tavily") {
    return tavilySearch(trimmedQuery, adapterOpts);
  }

  return perplexitySearch(trimmedQuery, adapterOpts);
}
