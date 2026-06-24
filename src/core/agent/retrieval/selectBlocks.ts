import type { ChatStreamChunk, LLMProvider } from "@/core/llm/types";
import { textFromChatStreamChunk } from "@/core/llm/types";
import {
  letterBitmap,
  passesPrefilter,
  queryBitmap,
} from "./bitmapPrefilter";
import type { Candidate } from "./manifest";
import { formatManifest } from "./manifest";

function buildSelectBlocksSystemPrompt(topK: number): string {
  return `You are selecting paper blocks that will be useful to an academic research assistant as it answers a user's query. You will be given the user's query and a list of available paper blocks with their ids, headings, and preview text.

Return a JSON object with an "ids" array containing block ids (in the form "paperId#blockId") that will clearly be useful for answering the user's query (up to ${topK}). Only include blocks that you are certain will be helpful based on their heading and preview.
- If you are unsure if a block will be useful in answering the user's query, then do not include it in your list. Be selective and discerning.
- If there are no blocks in the list that would clearly be useful, feel free to return an empty list.`;
}

function candidateText(candidate: Candidate): string {
  return [candidate.heading, candidate.preview].filter(Boolean).join(" ");
}

function bitmapPrefilter(query: string, candidates: Candidate[]): Candidate[] {
  const qBitmap = queryBitmap(query);
  return candidates.filter((candidate) =>
    passesPrefilter(letterBitmap(candidateText(candidate)), qBitmap),
  );
}

function candidateId(candidate: Candidate): string {
  return `${candidate.paperId}#${candidate.blockId}`;
}

function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<ChatStreamChunk> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  );
}

async function drainChatText(
  chatResult: AsyncIterable<ChatStreamChunk> | Promise<string>,
): Promise<string> {
  if (isAsyncIterable(chatResult)) {
    let text = "";
    for await (const chunk of chatResult) {
      text += textFromChatStreamChunk(chunk);
    }
    return text;
  }
  return chatResult;
}

function parseSelectedIds(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "ids" in parsed &&
      Array.isArray((parsed as { ids: unknown }).ids)
    ) {
      return (parsed as { ids: unknown[] }).ids.filter(
        (id): id is string => typeof id === "string",
      );
    }
    return null;
  } catch {
    return null;
  }
}

function validateIds(
  ids: string[],
  candidates: Candidate[],
  topK: number,
): string[] {
  const valid = new Set(candidates.map(candidateId));
  return ids.filter((id) => valid.has(id)).slice(0, topK);
}

export async function selectRelevantBlocks(args: {
  query: string;
  candidates: Candidate[];
  llm: LLMProvider;
  topK: number;
  signal: AbortSignal;
}): Promise<string[]> {
  const { query, candidates, llm, topK, signal } = args;

  if (candidates.length === 0) {
    return [];
  }

  try {
    const filtered = bitmapPrefilter(query, candidates);
    const pool = filtered.length > 0 ? filtered : candidates;

    const system = buildSelectBlocksSystemPrompt(topK);
    const user = `Query: ${query}\n\nAvailable blocks:\n${formatManifest(pool)}`;

    const chatResult = llm.chat({
      system,
      messages: [{ role: "user", content: user }],
      json: true,
      signal,
    });

    const raw = await drainChatText(chatResult);
    const ids = parseSelectedIds(raw);
    if (!ids || ids.length === 0) {
      return [];
    }

    return validateIds(ids, candidates, topK);
  } catch {
    return [];
  }
}
