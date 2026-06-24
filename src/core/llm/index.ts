import { listAnthropicModels } from "./providers/anthropic";
import { listGeminiModels } from "./providers/gemini";
import { listOpenAICompatibleModels } from "./providers/openai";
import type { ProviderConfig } from "./types";

export type {
  AssistantMessage,
  AgentContentBlock,
  ChatOptions,
  LLMProvider,
  Message,
  ProviderConfig,
  ReasoningEffort,
  StreamEvent,
  ToolSchema,
} from "./types";
export { DEFAULT_REASONING_EFFORT, DEFAULT_TRANSLATION_REASONING_EFFORT } from "./types";
export { LLMError } from "./http";
export { parseSSEStream } from "./sse";
export { createProvider } from "./createProvider";
export {
  providerConfigForTranslation,
  resolveDefaultReasoningEffort,
  resolveTranslationReasoningEffort,
} from "./providerReasoning";
export {
  diagnoseConnectionHints,
  testProviderConnection,
  type ConnectionTestHintCode,
  type ProviderConnectionTestResult,
} from "./testConnection";
export type { StoredOpenRouterModelMeta } from "./openrouterSchema";
export {
  OPENROUTER_MODELS_URL,
  buildOpenRouterLookupIds,
  fetchOpenRouterModelsCatalog,
  findOpenRouterModel,
  normalizeOpenRouterModelMeta,
  resetOpenRouterModelsCatalogCache,
  resolveOpenRouterModelMetadata,
  supportsOpenRouterMetaLookup,
} from "./openrouterModelMeta";

const MODEL_LISTING_PROVIDER_IDS = new Set([
  "openai",
  "deepseek",
  "anthropic",
  "gemini",
]);

export function supportsModelListing(providerId: string): boolean {
  return MODEL_LISTING_PROVIDER_IDS.has(providerId);
}

export async function listAvailableModels(
  config: ProviderConfig,
  deps?: { fetchFn?: typeof fetch },
): Promise<string[]> {
  switch (config.id) {
    case "openai":
    case "deepseek":
      return listOpenAICompatibleModels(config, deps);
    case "anthropic":
      return listAnthropicModels(config, deps);
    case "gemini":
      return listGeminiModels(config, deps);
    default:
      throw new Error(`Provider ${config.id} does not support model listing`);
  }
}
