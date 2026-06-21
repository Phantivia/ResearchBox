import { describe, expect, it } from "vitest";
import { createProvider } from "./createProvider";
import { OpenAICompatibleProvider } from "./providers/openai";

describe("createProvider", () => {
  it("creates OpenAICompatibleProvider for deepseek", () => {
    const provider = createProvider({
      id: "deepseek",
      apiKey: "sk-test",
      baseURL: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });

    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.id).toBe("deepseek");
  });
});
