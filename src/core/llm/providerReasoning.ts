import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SUB_AGENT_REASONING_EFFORT,
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

export function resolveSubAgentReasoningEffort(
  config: ProviderConfig,
): ReasoningEffort {
  return config.subAgentReasoningEffort ?? DEFAULT_SUB_AGENT_REASONING_EFFORT;
}

export function providerConfigForSubAgent(
  config: ProviderConfig,
): ProviderConfig {
  const subModel = config.subAgentModel?.trim();
  return {
    ...config,
    model: subModel || config.model,
    reasoningEffort: resolveSubAgentReasoningEffort(config),
  };
}
