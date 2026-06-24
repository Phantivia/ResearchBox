export const MAX_RESULT_CHARS = 30_000;
export const PREVIEW_CHARS = 2_000;

export function buildLargeToolResultMessage(
  serialized: string,
  resultId: string,
): string {
  const preview = serialized.slice(0, PREVIEW_CHARS);
  const truncated = serialized.length > PREVIEW_CHARS;
  return `<persisted_output>
Output too large (${serialized.length} chars). Full output saved with resultId: ${resultId}

To retrieve the full content, call fetch_result with resultId "${resultId}".

Preview (first ${PREVIEW_CHARS}):
${preview}${truncated ? "\n..." : ""}
</persisted_output>`;
}
