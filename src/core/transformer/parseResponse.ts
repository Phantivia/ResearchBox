import { z } from "zod";

export const TranslationItemSchema = z.object({
  id: z.string(),
  translation: z.string(),
});

export const TranslationBatchResponseSchema = z.object({
  translations: z.array(TranslationItemSchema),
});

export type TranslationBatchResponse = z.infer<typeof TranslationBatchResponseSchema>;

export function stripJsonFences(text: string): string {
  let trimmed = text.trim();

  const fullFence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fullFence?.[1]) {
    return fullFence[1].trim();
  }

  trimmed = trimmed.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  return trimmed.trim();
}

export type StreamingTranslationState = {
  completedIds: Set<string>;
  partialById: Map<string, string>;
};

export type StreamingTranslationUpdate = {
  blockId: string;
  translation: string;
  complete: boolean;
};

const COMPLETE_TRANSLATION_ITEM_RE =
  /\{(?=[^{}]*"id"\s*:\s*"((?:[^"\\]|\\.)*)")(?=[^{}]*"translation"\s*:\s*"((?:[^"\\]|\\.)*)")[^{}]*\}/g;

const PARTIAL_TRANSLATION_ITEM_RE =
  /\{\s*"id"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"translation"\s*:\s*"((?:[^"\\]|\\.)*)$/;

function decodeJsonStringFragment(fragment: string): string {
  try {
    return JSON.parse(`"${fragment}"`);
  } catch {
    let result = "";
    let index = 0;
    while (index < fragment.length) {
      const char = fragment[index];
      if (char === "\\") {
        const next = fragment[index + 1];
        if (next === undefined) {
          break;
        }
        switch (next) {
          case '"':
            result += '"';
            index += 2;
            break;
          case "\\":
            result += "\\";
            index += 2;
            break;
          case "n":
            result += "\n";
            index += 2;
            break;
          case "r":
            result += "\r";
            index += 2;
            break;
          case "t":
            result += "\t";
            index += 2;
            break;
          case "u": {
            const hex = fragment.slice(index + 2, index + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              result += String.fromCharCode(parseInt(hex, 16));
              index += 6;
            } else {
              result += next;
              index += 2;
            }
            break;
          }
          default:
            result += next;
            index += 2;
        }
      } else if (char === '"') {
        break;
      } else {
        result += char;
        index += 1;
      }
    }
    return result;
  }
}

/**
 * 从流式累积的 JSON 文本中提取译文更新（含未闭合的 partial 字符串）。
 */
export function extractStreamingTranslationUpdates(
  accumulated: string,
  state: StreamingTranslationState,
): StreamingTranslationUpdate[] {
  const stripped = stripJsonFences(accumulated);
  const updates: StreamingTranslationUpdate[] = [];

  for (const match of stripped.matchAll(COMPLETE_TRANSLATION_ITEM_RE)) {
    const blockId = decodeJsonStringFragment(match[1] ?? "");
    const translation = decodeJsonStringFragment(match[2] ?? "");
    if (state.completedIds.has(blockId)) {
      continue;
    }
    state.completedIds.add(blockId);
    state.partialById.delete(blockId);
    updates.push({ blockId, translation, complete: true });
  }

  const partialMatch = stripped.match(PARTIAL_TRANSLATION_ITEM_RE);
  if (!partialMatch) {
    return updates;
  }

  const blockId = decodeJsonStringFragment(partialMatch[1] ?? "");
  if (state.completedIds.has(blockId)) {
    return updates;
  }

  const translation = decodeJsonStringFragment(partialMatch[2] ?? "");
  if (state.partialById.get(blockId) === translation) {
    return updates;
  }

  state.partialById.set(blockId, translation);
  updates.push({ blockId, translation, complete: false });
  return updates;
}

export function parseTranslationBatchResponse(raw: string): TranslationBatchResponse {
  const stripped = stripJsonFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("Response is not valid JSON");
    }
    parsed = JSON.parse(stripped.slice(start, end + 1));
  }

  return TranslationBatchResponseSchema.parse(parsed);
}
