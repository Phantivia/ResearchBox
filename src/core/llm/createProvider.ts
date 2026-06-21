import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { OpenAICompatibleProvider } from "./providers/openai";
import type { LLMProvider, ProviderConfig } from "./types";

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.id) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "openai":
    case "deepseek":
    case "openrouter":
    case "siliconflow":
      return new OpenAICompatibleProvider(config);
    default:
      throw new Error(`Unknown LLM provider id: ${config.id}`);
  }
}
