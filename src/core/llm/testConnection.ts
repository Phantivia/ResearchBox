import { createProvider } from "./createProvider";
import { LLMError } from "./http";
import type { ProviderConfig } from "./types";

export type ConnectionTestHintCode =
  | "missing_api_key"
  | "missing_model"
  | "invalid_api_key"
  | "wrong_base_url"
  | "model_not_found"
  | "rate_limited"
  | "server_error"
  | "cors_or_network"
  | "unexpected_response";

export type ProviderConnectionTestSuccess = {
  ok: true;
  latencyMs: number;
  responseChars: number;
  responsePreview: string;
};

export type ProviderConnectionTestFailure = {
  ok: false;
  error: string;
  status?: number;
  hints: ConnectionTestHintCode[];
};

export type ProviderConnectionTestResult =
  | ProviderConnectionTestSuccess
  | ProviderConnectionTestFailure;

const TEST_SYSTEM_PROMPT = 'Reply with exactly the word "ok" and nothing else.';

export function diagnoseConnectionHints(input: {
  error: string;
  status?: number;
  body?: string;
  config: ProviderConfig;
}): ConnectionTestHintCode[] {
  const hints: ConnectionTestHintCode[] = [];
  const lowerError = input.error.toLowerCase();
  const lowerBody = (input.body ?? "").toLowerCase();

  if (!input.config.apiKey.trim()) {
    hints.push("missing_api_key");
  }
  if (!input.config.model.trim()) {
    hints.push("missing_model");
  }

  if (input.status === 401 || input.status === 403) {
    hints.push("invalid_api_key");
  }
  if (input.status === 404) {
    hints.push("wrong_base_url");
  }
  if (input.status === 429) {
    hints.push("rate_limited");
  }
  if (input.status !== undefined && input.status >= 500) {
    hints.push("server_error");
  }

  if (
    lowerBody.includes("model") &&
    (lowerBody.includes("not found") ||
      lowerBody.includes("does not exist") ||
      lowerBody.includes("invalid") ||
      lowerBody.includes("unknown"))
  ) {
    hints.push("model_not_found");
  }

  if (
    lowerError.includes("failed to fetch") ||
    lowerError.includes("networkerror") ||
    lowerError.includes("network request failed") ||
    lowerError.includes("cors")
  ) {
    hints.push("cors_or_network");
  }

  if (
    input.error.includes("unexpected stream") ||
    input.error.startsWith("Unexpected response:")
  ) {
    hints.push("unexpected_response");
  }

  return [...new Set(hints)];
}

function formatErrorFromLlmError(error: LLMError): string {
  const preview = error.body.trim().slice(0, 200);
  return preview ? `HTTP ${error.status}: ${preview}` : `HTTP ${error.status}`;
}

function buildPreview(response: string): string {
  const trimmed = response.trim();
  if (!trimmed) {
    return "(empty)";
  }
  if (trimmed.length <= 80) {
    return trimmed;
  }
  return `${trimmed.slice(0, 80)}…`;
}

export async function testProviderConnection(
  config: ProviderConfig,
  deps?: { fetchFn?: typeof fetch },
): Promise<ProviderConnectionTestResult> {
  if (!config.apiKey.trim() || !config.baseURL.trim() || !config.model.trim()) {
    const error = "Missing required provider configuration.";
    return {
      ok: false,
      error,
      hints: diagnoseConnectionHints({ error, config }),
    };
  }

  const startedAt = performance.now();

  try {
    const provider = createProvider(config);
    const result = await provider.chat(
      {
        system: TEST_SYSTEM_PROMPT,
        messages: [{ role: "user", content: "ping" }],
      },
      deps,
    );

    const latencyMs = performance.now() - startedAt;

    if (typeof result !== "string") {
      const error = "Provider returned an unexpected stream response.";
      return {
        ok: false,
        error,
        hints: diagnoseConnectionHints({ error, config }),
      };
    }

    if (!result.toLowerCase().includes("ok")) {
      const error = `Unexpected response: ${result.slice(0, 120)}`;
      return {
        ok: false,
        error,
        hints: diagnoseConnectionHints({ error, config }),
      };
    }

    return {
      ok: true,
      latencyMs,
      responseChars: result.length,
      responsePreview: buildPreview(result),
    };
  } catch (error) {
    if (error instanceof LLMError) {
      const message = formatErrorFromLlmError(error);
      return {
        ok: false,
        error: message,
        status: error.status,
        hints: diagnoseConnectionHints({
          error: message,
          status: error.status,
          body: error.body,
          config,
        }),
      };
    }

    const message =
      error instanceof Error ? error.message : "Unknown connection error.";
    return {
      ok: false,
      error: message,
      hints: diagnoseConnectionHints({ error: message, config }),
    };
  }
}
