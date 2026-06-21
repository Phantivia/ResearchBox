import { cleanArxivHtml } from "@/core/cleaner";
import { fetchPaperHtml } from "@/core/fetcher/fetchPaper";
import { parseArxivId } from "@/core/fetcher/parseId";
import { PaperIRSchema, type PaperIR } from "@/core/ir";
import type { LLMProvider } from "@/core/llm";
import { isOffline, OfflineUncachedError, type OnlineProbe } from "@/core/network";
import {
  isPaperTranslationComplete,
  resumeTranslation,
  transformToIR,
  type TransformProgress,
} from "@/core/transformer";
import { getPaperCached, savePaper } from "@/db";
import { persistTranslationProgress } from "./persistDraft";

export class InvalidArxivIdError extends Error {
  constructor(public readonly input: string) {
    super(`Invalid arXiv ID: ${input}`);
    this.name = "InvalidArxivIdError";
  }
}

export type LoadPaperDeps = {
  fetchFn?: typeof fetch;
  isOnline?: OnlineProbe;
};

export type LoadPaperWithTranslationOpts = {
  targetLang: string;
  modelLabel: string;
  forceRefresh?: boolean;
  debugMode?: boolean;
  signal?: AbortSignal;
};

export type LoadPaperWithTranslationProgress =
  | TransformProgress
  | { type: "cache-hit"; ir: PaperIR };

export type LoadPaperDisplayResult = {
  kind: "cache" | "readonly";
  ir: PaperIR;
};

export async function loadPaperForDisplay(
  input: string,
  deps?: LoadPaperDeps,
): Promise<LoadPaperDisplayResult> {
  const parsed = parseArxivId(input);
  if (!parsed) {
    throw new InvalidArxivIdError(input);
  }

  const { id, version: parsedVersion } = parsed;
  const onlineProbe = deps?.isOnline ?? (() => !isOffline());

  const cached = await getPaperCached(id, parsedVersion);
  if (cached) {
    return { kind: "cache", ir: PaperIRSchema.parse(cached) };
  }

  if (isOffline(onlineProbe)) {
    throw new OfflineUncachedError(id);
  }

  const paper = await loadPaperReadonly(input, deps);
  return { kind: "readonly", ir: paper };
}

async function* runTranslationWithPersistence(
  source: AsyncGenerator<TransformProgress>,
): AsyncGenerator<TransformProgress> {
  let draftIr: PaperIR | null = null;

  try {
    for await (const event of source) {
      yield event;
      draftIr = await persistTranslationProgress(draftIr, event);
    }
  } catch (error) {
    if (
      draftIr &&
      error instanceof DOMException &&
      error.name === "AbortError" &&
      !isPaperTranslationComplete(draftIr)
    ) {
      await savePaper(draftIr);
    }
    throw error;
  }
}

export async function loadPaperReadonly(
  input: string,
  deps?: LoadPaperDeps,
): Promise<PaperIR> {
  const parsed = parseArxivId(input);
  if (!parsed) {
    throw new InvalidArxivIdError(input);
  }

  const { id, version: parsedVersion } = parsed;
  const onlineProbe = deps?.isOnline ?? (() => !isOffline());

  if (isOffline(onlineProbe)) {
    const cached = await getPaperCached(id, parsedVersion);
    if (cached) {
      return PaperIRSchema.parse(cached);
    }
    throw new OfflineUncachedError(id);
  }

  const { html, source, resolvedUrl } = await fetchPaperHtml(id, parsedVersion, deps);
  const cleaned = cleanArxivHtml(html, source, resolvedUrl);

  // TODO: 渲染后从页面真实版本号回填（当 parsedVersion 为 null 时）
  const version = parsedVersion ?? "latest";

  const paper: PaperIR = {
    arxivId: id,
    version,
    title: cleaned.title,
    authors: cleaned.authors,
    abstract: cleaned.abstract,
    abstractBlocks: cleaned.abstractBlocks,
    blocks: cleaned.blocks,
    references: cleaned.references,
    createdAt: Date.now(),
    modelUsed: "none",
  };

  return PaperIRSchema.parse(paper);
}

export async function* loadPaperWithTranslation(
  input: string,
  provider: LLMProvider,
  opts: LoadPaperWithTranslationOpts,
  deps?: LoadPaperDeps,
): AsyncGenerator<LoadPaperWithTranslationProgress> {
  const parsed = parseArxivId(input);
  if (!parsed) {
    throw new InvalidArxivIdError(input);
  }

  const { id, version: parsedVersion } = parsed;
  const versionKey = parsedVersion ?? "latest";

  const onlineProbe = deps?.isOnline ?? (() => !isOffline());

  if (!opts.forceRefresh) {
    const cached = await getPaperCached(id, parsedVersion);
    if (cached && isPaperTranslationComplete(cached)) {
      yield { type: "cache-hit", ir: cached };
      return;
    }

    if (cached && !isPaperTranslationComplete(cached)) {
      if (isOffline(onlineProbe)) {
        yield { type: "cache-hit", ir: cached };
        return;
      }

      yield* runTranslationWithPersistence(
        resumeTranslation(cached, provider, {
          targetLang: opts.targetLang,
          modelLabel: opts.modelLabel,
          arxivId: id,
          version: versionKey,
          debugMode: opts.debugMode,
          signal: opts.signal,
        }),
      );
      return;
    }
  }

  if (isOffline(onlineProbe)) {
    throw new OfflineUncachedError(id);
  }

  const { html, source, resolvedUrl } = await fetchPaperHtml(id, parsedVersion, deps);
  const cleaned = cleanArxivHtml(html, source, resolvedUrl);

  yield* runTranslationWithPersistence(
    transformToIR(cleaned, provider, {
      targetLang: opts.targetLang,
      modelLabel: opts.modelLabel,
      arxivId: id,
      version: versionKey,
      debugMode: opts.debugMode,
      signal: opts.signal,
    }),
  );
}
