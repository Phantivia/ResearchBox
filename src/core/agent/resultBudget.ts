import { estimateTokensFromString } from "./contextSize";

export const MAX_RESULT_TOKENS = 100_000;
export const PREVIEW_CHARS = 2_000;

export function shouldPersistToolResult(serialized: string): boolean {
  return estimateTokensFromString(serialized) >= MAX_RESULT_TOKENS;
}

export function buildLargeToolResultMessage(
  serialized: string,
  resultId: string,
): string {
  const estimatedTokens = estimateTokensFromString(serialized);
  const preview = serialized.slice(0, PREVIEW_CHARS);
  const truncated = serialized.length > PREVIEW_CHARS;
  return `<persisted_output>
Output too large (~${estimatedTokens} estimated tokens). Full output saved with resultId: ${resultId}

To retrieve the full content, call fetch_result with resultId "${resultId}".

Preview (first ${PREVIEW_CHARS} chars):
${preview}${truncated ? "\n..." : ""}
</persisted_output>`;
}
