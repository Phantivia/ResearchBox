export type PromptBlock = {
  id: string;
  content: string;
};

export type CompletedBlock = {
  id: string;
  source: string;
  translation: string;
};

const COMMON_RULES = [
  "- Output ONLY valid JSON. No Markdown code fences, no preamble, no trailing commentary.",
  '- Schema: { "translations": [ { "id": "<block id>", "translation": "<translated text>" } ] }',
  '- In each translation object, output "id" first and "translation" second; do not add any other fields.',
  "- For domain-specific technical terms, provide the localized translation followed immediately by the original term in parentheses — e.g. 注意力机制（attention mechanism）. Keep proper nouns unchanged unless a well-established localized form exists.",
  "- Do NOT translate math or code blocks (they are not included in input).",
  "- Content may contain inline HTML (e.g. <cite>, <a>, <em>). Keep every tag and ALL its attributes (href, data-ref, class, id) byte-for-byte unchanged; only translate the human-readable text between tags.",
  "- Do not add, drop, or reorder any HTML tags.",
];

export function buildTranslationSystemPrompt(targetLang: string): string {
  return [
    "You are a precise academic translator.",
    `Translate ALL given content blocks into ${targetLang} in a single response.`,
    "",
    "Rules:",
    ...COMMON_RULES,
    "- Return ALL entries from the input `blocks` array in the same order — do not skip any.",
  ].join("\n");
}

export function buildContinueTranslationSystemPrompt(targetLang: string): string {
  return [
    "You are a precise academic translator resuming a partial translation.",
    `Translate the remaining content blocks into ${targetLang} in a single response.`,
    "",
    "Rules:",
    ...COMMON_RULES,
    "- If `completed` is present, it contains previously translated blocks for terminology and style reference ONLY. Do NOT output entries for `completed` blocks.",
    "- Translate ONLY the blocks in `blocks` — return one entry per `blocks` id in the same order.",
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

export function buildContinueTranslationUserPrompt(
  completed: CompletedBlock[],
  pendingBlocks: PromptBlock[],
): string {
  if (completed.length === 0) {
    return JSON.stringify({ blocks: pendingBlocks });
  }

  return JSON.stringify({ completed, blocks: pendingBlocks });
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

export function buildContinueRetryUserPrompt(
  completed: CompletedBlock[],
  pendingBlocks: PromptBlock[],
  previousOutput: string,
): string {
  return [
    buildContinueTranslationUserPrompt(completed, pendingBlocks),
    "",
    "Your previous response was invalid JSON or did not match the required schema.",
    "Output ONLY the corrected JSON object with no Markdown fences or extra text.",
    "",
    "Previous invalid output:",
    previousOutput,
  ].join("\n");
}
