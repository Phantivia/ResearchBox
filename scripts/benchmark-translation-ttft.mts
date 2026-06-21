import {
  formatTranslationLatencyMetrics,
  measureTranslationStreamLatency,
} from "../src/core/llm/measureTranslationLatency.ts";
import { createProvider } from "../src/core/llm/index.ts";
import type { ProviderConfig } from "../src/core/llm/types.ts";
import { INITIAL_MAX_CHUNK_CHARS } from "../src/core/transformer/chunk.ts";

function providerConfigFromEnv(): ProviderConfig | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  const id = process.env.LLM_PROVIDER_ID?.trim() ?? "deepseek";

  if (!apiKey || !baseURL || !model) {
    return null;
  }

  return { id, apiKey, baseURL, model };
}

const targetInputChars = Number.parseInt(
  process.env.BENCH_INPUT_CHARS ?? String(INITIAL_MAX_CHUNK_CHARS),
  10,
);

async function main(): Promise<void> {
  const config = providerConfigFromEnv();
  if (!config) {
    console.error(
      "Missing env vars. Set LLM_API_KEY, LLM_BASE_URL, LLM_MODEL (optional: LLM_PROVIDER_ID, BENCH_INPUT_CHARS).",
    );
    process.exit(1);
  }

  console.log(
    `Running app-path TTFT benchmark (${targetInputChars} user-message chars, provider=${config.id}, model=${config.model})`,
  );

  const provider = createProvider(config);
  const metrics = await measureTranslationStreamLatency(provider, {
    targetInputChars,
    targetLang: process.env.BENCH_TARGET_LANG ?? "zh",
  });

  console.log(formatTranslationLatencyMetrics("app-path (Node/core)", metrics));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
