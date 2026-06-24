import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TRANSLATION_REASONING_EFFORT,
  type ProviderConfig,
  type ReasoningEffort,
} from "./types";

export function resolveDefaultReasoningEffort(
  config: ProviderConfig,
): ReasoningEffort {
  return config.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
}

export function resolveTranslationReasoningEffort(
  config: ProviderConfig,
): ReasoningEffort {
  return config.translationReasoningEffort ?? DEFAULT_TRANSLATION_REASONING_EFFORT;
}

export function providerConfigForTranslation(
  config: ProviderConfig,
): ProviderConfig {
  return {
    ...config,
    reasoningEffort: resolveTranslationReasoningEffort(config),
  };
}
