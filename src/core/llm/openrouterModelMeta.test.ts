import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenRouterLookupIds,
  fetchOpenRouterModelsCatalog,
  findOpenRouterModel,
  normalizeOpenRouterModelMeta,
  resetOpenRouterModelsCatalogCache,
  resolveOpenRouterModelMetadata,
  supportsOpenRouterMetaLookup,
} from "./openrouterModelMeta";
import type { OpenRouterModelApi } from "./openrouterSchema";

const SAMPLE_MODELS: OpenRouterModelApi[] = [
  {
    id: "openai/gpt-5.4",
    name: "OpenAI: GPT-5.4",
    context_length: 1050000,
    architecture: {
      modality: "text->text",
      input_modalities: ["text"],
      output_modalities: ["text"],
    },
    pricing: { prompt: "0.0000025", completion: "0.000015" },
    supported_parameters: ["response_format", "tools"],
    top_provider: { max_completion_tokens: 32768, is_moderated: false },
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek: DeepSeek Chat",
    context_length: 163840,
    supported_parameters: ["temperature"],
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Anthropic: Claude Sonnet 4.6",
    context_length: 1000000,
    reasoning: { mandatory: false, default_effort: "medium" },
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Google: Gemini 2.5 Flash",
    context_length: 1048576,
  },
];

function mockFetch(models: OpenRouterModelApi[]) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: models }), { status: 200 }),
  );
}

afterEach(() => {
  resetOpenRouterModelsCatalogCache();
});

describe("supportsOpenRouterMetaLookup", () => {
  it("includes the four direct vendors and openrouter", () => {
    expect(supportsOpenRouterMetaLookup("openai")).toBe(true);
    expect(supportsOpenRouterMetaLookup("deepseek")).toBe(true);
    expect(supportsOpenRouterMetaLookup("anthropic")).toBe(true);
    expect(supportsOpenRouterMetaLookup("gemini")).toBe(true);
    expect(supportsOpenRouterMetaLookup("openrouter")).toBe(true);
    expect(supportsOpenRouterMetaLookup("siliconflow")).toBe(false);
  });
});

describe("buildOpenRouterLookupIds", () => {
  it("maps direct vendor model ids to OpenRouter ids", () => {
    expect(buildOpenRouterLookupIds("openai", "gpt-5.4")).toEqual([
      "openai/gpt-5.4",
    ]);
    expect(buildOpenRouterLookupIds("gemini", "gemini-2.5-flash")).toEqual([
      "google/gemini-2.5-flash",
    ]);
  });

  it("uses the model id as-is for openrouter", () => {
    expect(
      buildOpenRouterLookupIds("openrouter", "anthropic/claude-sonnet-4.6"),
    ).toEqual(["anthropic/claude-sonnet-4.6"]);
  });
});

describe("findOpenRouterModel", () => {
  it("finds a matching model case-insensitively", () => {
    const match = findOpenRouterModel(SAMPLE_MODELS, "deepseek", "deepseek-chat");
    expect(match?.id).toBe("deepseek/deepseek-chat");
  });

  it("returns undefined when no catalog entry matches", () => {
    expect(
      findOpenRouterModel(SAMPLE_MODELS, "anthropic", "claude-sonnet-4-20250514"),
    ).toBeUndefined();
  });
});

describe("normalizeOpenRouterModelMeta", () => {
  it("stores a normalized subset tagged with source openrouter", () => {
    const model = SAMPLE_MODELS[0]!;
    const meta = normalizeOpenRouterModelMeta(model, 1_700_000_000_000);

    expect(meta).toMatchObject({
      source: "openrouter",
      fetchedAt: 1_700_000_000_000,
      openRouterId: "openai/gpt-5.4",
      name: "OpenAI: GPT-5.4",
      contextLength: 1050000,
      supportedParameters: ["response_format", "tools"],
    });
  });
});

describe("fetchOpenRouterModelsCatalog", () => {
  it("fetches once and reuses the in-memory catalog", async () => {
    const fetchFn = mockFetch(SAMPLE_MODELS);

    const first = await fetchOpenRouterModelsCatalog({ fetchFn });
    const second = await fetchOpenRouterModelsCatalog({ fetchFn });

    expect(first).toHaveLength(4);
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("resolveOpenRouterModelMetadata", () => {
  it("resolves metadata for a direct vendor model", async () => {
    const fetchFn = mockFetch(SAMPLE_MODELS);

    const meta = await resolveOpenRouterModelMetadata({
      providerId: "gemini",
      model: "gemini-2.5-flash",
      fetchFn,
    });

    expect(meta).toMatchObject({
      source: "openrouter",
      openRouterId: "google/gemini-2.5-flash",
      name: "Google: Gemini 2.5 Flash",
    });
  });

  it("returns null when the model is absent from OpenRouter", async () => {
    const fetchFn = mockFetch(SAMPLE_MODELS);

    const meta = await resolveOpenRouterModelMetadata({
      providerId: "openai",
      model: "gpt-unknown",
      fetchFn,
    });

    expect(meta).toBeNull();
  });
});
