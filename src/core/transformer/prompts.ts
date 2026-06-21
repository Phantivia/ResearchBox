export type PromptBlock = {
  id: string;
  content: string;
};

export function buildTranslationSystemPrompt(targetLang: string): string {
  return [
    "You are a precise academic translator.",
    `Translate the given content blocks into ${targetLang}.`,
    "",
    "Rules:",
    "- Output ONLY valid JSON. No Markdown code fences, no preamble, no trailing commentary.",
    '- Schema: { "translations": [ { "id": "<block id>", "translation": "<translated text>" } ] }',
    '- In each translation object, output "id" first and "translation" second; do not add any other fields.',
    "- Preserve technical terminology; do not translate proper nouns unless a standard localized form exists.",
    "- Do NOT translate math or code blocks (they are not included in input).",
    "- Content may contain inline HTML (e.g. <cite>, <a>, <em>). Keep every tag and ALL its attributes (href, data-ref, class, id) byte-for-byte unchanged; only translate the human-readable text between tags.",
    "- Do not add, drop, or reorder any HTML tags.",
    "- Return one entry per input block id in `blocks`.",
    "- If `context` is present, it contains preceding source text for continuity only; do NOT translate or return entries for context blocks.",
  ].join("\n");
}

export function buildTranslationUserPrompt(
  blocks: PromptBlock[],
  contextBlocks: PromptBlock[] = [],
): string {
  if (contextBlocks.length === 0) {
    return JSON.stringify({ blocks });
  }

  return JSON.stringify({ context: contextBlocks, blocks });
}

export function buildRetryUserPrompt(
  blocks: PromptBlock[],
  previousOutput: string,
  contextBlocks: PromptBlock[] = [],
): string {
  return [
    buildTranslationUserPrompt(blocks, contextBlocks),
    "",
    "Your previous response was invalid JSON or did not match the required schema.",
    "Output ONLY the corrected JSON object with no Markdown fences or extra text.",
    "",
    "Previous invalid output:",
    previousOutput,
  ].join("\n");
}
