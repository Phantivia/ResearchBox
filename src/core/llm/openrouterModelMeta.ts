import {
  OpenRouterModelsApiResponseSchema,
  StoredOpenRouterModelMetaSchema,
  type OpenRouterModelApi,
  type StoredOpenRouterModelMeta,
} from "./openrouterSchema";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const OPENROUTER_LOOKUP_PROVIDER_IDS = new Set([
  "openai",
  "deepseek",
  "anthropic",
  "gemini",
  "openrouter",
]);

const PROVIDER_OPENROUTER_PREFIX: Record<string, string> = {
  openai: "openai",
  deepseek: "deepseek",
  anthropic: "anthropic",
  gemini: "google",
};

let catalogCache: OpenRouterModelApi[] | null = null;
let catalogFetchPromise: Promise<OpenRouterModelApi[]> | null = null;

export function supportsOpenRouterMetaLookup(providerId: string): boolean {
  return OPENROUTER_LOOKUP_PROVIDER_IDS.has(providerId);
}

export function resetOpenRouterModelsCatalogCache(): void {
  catalogCache = null;
  catalogFetchPromise = null;
}

export function buildOpenRouterLookupIds(
  providerId: string,
  model: string,
): string[] {
  const trimmed = model.trim();
  if (!trimmed) {
    return [];
  }

  if (providerId === "openrouter") {
    return [trimmed];
  }

  const prefix = PROVIDER_OPENROUTER_PREFIX[providerId];
  if (!prefix) {
    return [];
  }

  const ids = new Set<string>([`${prefix}/${trimmed}`]);
  if (trimmed.includes("/")) {
    ids.add(trimmed);
  }

  return [...ids];
}

export function findOpenRouterModel(
  models: readonly OpenRouterModelApi[],
  providerId: string,
  model: string,
): OpenRouterModelApi | undefined {
  const lookupIds = new Set(
    buildOpenRouterLookupIds(providerId, model).map((id) => id.toLowerCase()),
  );

  return models.find((entry) => lookupIds.has(entry.id.toLowerCase()));
}

export function normalizeOpenRouterModelMeta(
  model: OpenRouterModelApi,
  fetchedAt: number,
): StoredOpenRouterModelMeta {
  return StoredOpenRouterModelMetaSchema.parse({
    source: "openrouter",
    fetchedAt,
    openRouterId: model.id,
    name: model.name,
    description: model.description,
    contextLength:
      model.context_length ?? model.top_provider?.context_length ?? null,
    modality: model.architecture?.modality,
    inputModalities: model.architecture?.input_modalities ?? [],
    outputModalities: model.architecture?.output_modalities ?? [],
    pricing: model.pricing,
    supportedParameters: model.supported_parameters ?? [],
    maxCompletionTokens: model.top_provider?.max_completion_tokens ?? null,
    isModerated: model.top_provider?.is_moderated,
    reasoning: model.reasoning ?? null,
  });
}

export async function fetchOpenRouterModelsCatalog(deps?: {
  apiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<OpenRouterModelApi[]> {
  if (catalogCache) {
    return catalogCache;
  }

  if (!catalogFetchPromise) {
    catalogFetchPromise = (async () => {
      const fetchFn = deps?.fetchFn ?? globalThis.fetch;
      const headers: Record<string, string> = {};
      const apiKey = deps?.apiKey?.trim();
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetchFn(OPENROUTER_MODELS_URL, { headers });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `OpenRouter models request failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const json = await response.json();
      const parsed = OpenRouterModelsApiResponseSchema.parse(json);
      catalogCache = parsed.data;
      return catalogCache;
    })();
  }

  return catalogFetchPromise;
}

export async function resolveOpenRouterModelMetadata(input: {
  providerId: string;
  model: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<StoredOpenRouterModelMeta | null> {
  if (
    !supportsOpenRouterMetaLookup(input.providerId) ||
    !input.model.trim()
  ) {
    return null;
  }

  const catalog = await fetchOpenRouterModelsCatalog({
    apiKey: input.providerId === "openrouter" ? input.apiKey : undefined,
    fetchFn: input.fetchFn,
  });

  const match = findOpenRouterModel(
    catalog,
    input.providerId,
    input.model.trim(),
  );
  if (!match) {
    return null;
  }

  return normalizeOpenRouterModelMeta(match, Date.now());
}
