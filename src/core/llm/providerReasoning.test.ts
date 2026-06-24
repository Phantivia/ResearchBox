import { describe, expect, it } from "vitest";
import {
  providerConfigForSubAgent,
  providerConfigForTranslation,
  resolveDefaultReasoningEffort,
  resolveSubAgentReasoningEffort,
  resolveTranslationReasoningEffort,
} from "./providerReasoning";
import type { ProviderConfig } from "./types";

const BASE_CONFIG: ProviderConfig = {
  id: "openai",
  apiKey: "sk-test",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o",
};

describe("providerReasoning", () => {
  it("resolves default reasoning effort with fallback to low", () => {
    expect(resolveDefaultReasoningEffort(BASE_CONFIG)).toBe("low");
    expect(
      resolveDefaultReasoningEffort({ ...BASE_CONFIG, reasoningEffort: "high" }),
    ).toBe("high");
  });

  it("resolves translation reasoning effort with fallback to off", () => {
    expect(resolveTranslationReasoningEffort(BASE_CONFIG)).toBe("off");
    expect(
      resolveTranslationReasoningEffort({
        ...BASE_CONFIG,
        translationReasoningEffort: "medium",
      }),
    ).toBe("medium");
  });

  it("resolves sub-agent reasoning effort with fallback to off", () => {
    expect(resolveSubAgentReasoningEffort(BASE_CONFIG)).toBe("off");
    expect(
      resolveSubAgentReasoningEffort({
        ...BASE_CONFIG,
        subAgentReasoningEffort: "medium",
      }),
    ).toBe("medium");
  });

  it("builds translation provider config without mutating default effort", () => {
    const config: ProviderConfig = {
      ...BASE_CONFIG,
      reasoningEffort: "high",
      translationReasoningEffort: "low",
    };

    const translationConfig = providerConfigForTranslation(config);

    expect(translationConfig.reasoningEffort).toBe("low");
    expect(config.reasoningEffort).toBe("high");
  });

  it("builds sub-agent provider config without mutating default effort", () => {
    const config: ProviderConfig = {
      ...BASE_CONFIG,
      reasoningEffort: "high",
      subAgentModel: "gpt-4o-mini",
      subAgentReasoningEffort: "low",
    };

    const subAgentConfig = providerConfigForSubAgent(config);

    expect(subAgentConfig.model).toBe("gpt-4o-mini");
    expect(subAgentConfig.reasoningEffort).toBe("low");
    expect(config.reasoningEffort).toBe("high");
  });
});
