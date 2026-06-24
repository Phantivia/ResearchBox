import type { WebSearchProvider } from "@/core/settings/schema";

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchFailureReason =
  | "missing_api_key"
  | "empty_query"
  | "http_error"
  | "network_error"
  | "timeout"
  | "aborted";

export type WebSearchFailure = {
  reason: WebSearchFailureReason;
  provider: WebSearchProvider;
  detail?: string;
};

export type WebSearchOutcome = {
  hits: WebHit[];
  failure?: WebSearchFailure;
};

export type WebSearchAdapterOptions = {
  maxResults: number;
  apiKey: string;
  provider: WebSearchProvider;
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
const PERPLEXITY_SONAR_URL = "https://api.perplexity.ai/v1/sonar";
const PERPLEXITY_SONAR_MODEL = "sonar";
const PERPLEXITY_MAX_OUTPUT_TOKENS = 16;
const WEB_SEARCH_TIMEOUT_MS = 30_000;

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
};

type TavilySearchResponse = {
  results?: TavilyResult[];
};

type PerplexitySearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
};

type PerplexityChatCompletionResponse = {
  search_results?: PerplexitySearchResult[];
};

export function providerLabel(provider: WebSearchProvider): string {
  return provider === "tavily" ? "Tavily" : "Perplexity";
}

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

function mapPerplexityHit(result: PerplexitySearchResult): WebHit | null {
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

function classifyFetchError(
  error: unknown,
  provider: WebSearchProvider,
  userSignal: AbortSignal,
): WebSearchOutcome {
  if (error instanceof Error && error.name === "AbortError") {
    if (userSignal.aborted) {
      return {
        hits: [],
        failure: { reason: "aborted", provider },
      };
    }
    return {
      hits: [],
      failure: {
        reason: "timeout",
        provider,
        detail: `${WEB_SEARCH_TIMEOUT_MS / 1000}s`,
      },
    };
  }

  return {
    hits: [],
    failure: {
      reason: "network_error",
      provider,
      detail: error instanceof Error ? error.message : String(error),
    },
  };
}

async function readHttpFailure(
  response: Response,
  provider: WebSearchProvider,
): Promise<WebSearchOutcome> {
  let detail = `HTTP ${response.status}`;
  try {
    const body = await response.text();
    if (body.trim()) {
      detail = `${detail}: ${body.trim().slice(0, 200)}`;
    }
  } catch {
    // Response body is optional for error classification.
  }

  return {
    hits: [],
    failure: {
      reason: "http_error",
      provider,
      detail,
    },
  };
}

async function adapterSearch<TResponse>(
  url: string,
  query: string,
  opts: WebSearchAdapterOptions,
  mapPayload: (payload: TResponse) => WebHit[],
): Promise<WebSearchOutcome> {
  const doFetch = opts.fetchFn ?? globalThis.fetch;
  const signal = mergeAbortSignals(opts.signal, WEB_SEARCH_TIMEOUT_MS);

  try {
    const response = await doFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey.trim()}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(Math.max(opts.maxResults, 1), 20),
      }),
      signal,
    });

    if (!response.ok) {
      return readHttpFailure(response, opts.provider);
    }

    const payload = (await response.json()) as TResponse;
    return {
      hits: mapPayload(payload).slice(0, opts.maxResults),
    };
  } catch (error) {
    return classifyFetchError(error, opts.provider, opts.signal);
  }
}

export async function tavilySearch(
  query: string,
  opts: WebSearchAdapterOptions,
): Promise<WebSearchOutcome> {
  return adapterSearch<TavilySearchResponse>(TAVILY_SEARCH_URL, query, opts, (payload) =>
    (payload.results ?? [])
      .map(mapTavilyHit)
      .filter((hit): hit is WebHit => hit !== null),
  );
}

export async function perplexitySearch(
  query: string,
  opts: WebSearchAdapterOptions,
): Promise<WebSearchOutcome> {
  const doFetch = opts.fetchFn ?? globalThis.fetch;
  const signal = mergeAbortSignals(opts.signal, WEB_SEARCH_TIMEOUT_MS);

  try {
    const response = await doFetch(PERPLEXITY_SONAR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_SONAR_MODEL,
        messages: [{ role: "user", content: query }],
        max_tokens: PERPLEXITY_MAX_OUTPUT_TOKENS,
      }),
      signal,
    });

    if (!response.ok) {
      return readHttpFailure(response, opts.provider);
    }

    const payload = (await response.json()) as PerplexityChatCompletionResponse;
    const hits = (payload.search_results ?? [])
      .map(mapPerplexityHit)
      .filter((hit): hit is WebHit => hit !== null)
      .slice(0, opts.maxResults);

    return { hits };
  } catch (error) {
    return classifyFetchError(error, opts.provider, opts.signal);
  }
}

export async function runWebSearch(input: RunWebSearchInput): Promise<WebSearchOutcome> {
  const trimmedQuery = input.query.trim();
  if (!trimmedQuery) {
    return {
      hits: [],
      failure: {
        reason: "empty_query",
        provider: input.provider,
        detail: "query must not be empty",
      },
    };
  }

  if (input.maxResults <= 0) {
    return {
      hits: [],
      failure: {
        reason: "empty_query",
        provider: input.provider,
        detail: "maxResults must be positive",
      },
    };
  }

  const apiKey =
    input.provider === "tavily" ? input.tavilyApiKey : input.perplexityApiKey;
  if (!apiKey.trim()) {
    return {
      hits: [],
      failure: {
        reason: "missing_api_key",
        provider: input.provider,
      },
    };
  }

  const adapterOpts: WebSearchAdapterOptions = {
    maxResults: input.maxResults,
    apiKey,
    provider: input.provider,
    signal: input.signal,
    fetchFn: input.fetchFn,
  };

  if (input.provider === "tavily") {
    return tavilySearch(trimmedQuery, adapterOpts);
  }

  return perplexitySearch(trimmedQuery, adapterOpts);
}
