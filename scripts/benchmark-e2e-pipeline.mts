import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  Node: dom.window.Node,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
});

import { cleanArxivHtml } from "../src/core/cleaner/clean.ts";
import { fetchPaperHtml } from "../src/core/fetcher/fetchPaper.ts";
import { createProvider } from "../src/core/llm/index.ts";
import {
  chunkPaperBlocksForTranslation,
  isTranslatableBlock,
} from "../src/core/transformer/chunk.ts";
import { transformToIR } from "../src/core/transformer/transform.ts";

const arxivId = process.argv[2] ?? "2501.12948";
const apiKey = process.env.LLM_API_KEY?.trim();
const baseURL = process.env.LLM_BASE_URL?.trim() ?? "https://api.deepseek.com/v1";
const model = process.env.LLM_MODEL?.trim() ?? "deepseek-chat";

if (!apiKey) {
  console.error("Set LLM_API_KEY");
  process.exit(1);
}

function ms(start: number): string {
  return `${(performance.now() - start).toFixed(0)} ms`;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  console.log(`E2E pipeline benchmark for arXiv:${arxivId}\n`);

  const tFetch = performance.now();
  const { html, source } = await fetchPaperHtml(arxivId, null);
  console.log(`1. fetch HTML (${source}, ${(html.length / 1024).toFixed(0)} KB): ${ms(tFetch)}`);

  const tClean = performance.now();
  const cleaned = cleanArxivHtml(html, source);
  const tCleanDone = performance.now();
  console.log(
    `2. clean HTML (${cleaned.blocks.length} body blocks, ${cleaned.abstractBlocks.length} abstract blocks): ${(tCleanDone - tClean).toFixed(0)} ms`,
  );
  console.log(`   -> structure ready at: ${ms(t0)}`);

  const chunks = chunkPaperBlocksForTranslation(
    cleaned.abstractBlocks,
    cleaned.blocks,
  );
  const translatable =
    cleaned.abstractBlocks.filter(isTranslatableBlock).length +
    cleaned.blocks.filter(isTranslatableBlock).length;
  console.log(
    `3. translation plan: ${chunks.length} sequential API batches, ${translatable} translatable blocks`,
  );
  for (const [i, chunk] of chunks.entries()) {
    console.log(
      `   batch ${i + 1}: ${chunk.blocks.length} blocks, ${chunk.charCount} chars`,
    );
  }

  const provider = createProvider({
    id: "deepseek",
    apiKey,
    baseURL,
    model,
  });

  let firstPartialAt: number | null = null;
  let firstCompleteAt: number | null = null;
  let firstBatchDoneAt: number | null = null;
  let batchIndex = 0;
  let eventCount = 0;
  let batchStart = performance.now();

  const tTransform = performance.now();
  for await (const event of transformToIR(cleaned, provider, {
    targetLang: "zh",
    modelLabel: model,
    arxivId,
  })) {
    if (event.type === "structure") {
      console.log(`4. transform structure event: ${ms(tTransform)} (since transform start)`);
      batchStart = performance.now();
      continue;
    }

    if (event.type === "block-translated") {
      eventCount += 1;
      const now = performance.now();
      if (firstPartialAt === null) {
        firstPartialAt = now;
        console.log(
          `5. FIRST translation visible in core (${event.partial ? "partial" : "complete"}, block=${event.blockId}, len=${event.translation.length}): ${ms(t0)} total, ${ms(tTransform)} since transform`,
        );
        console.log(`   preview: ${JSON.stringify(event.translation.slice(0, 60))}`);
      }
      if (!event.partial && firstCompleteAt === null) {
        firstCompleteAt = now;
        console.log(`6. first COMPLETE block translation: ${ms(t0)} total`);
      }
    }

    if (event.type === "done" || event.type === "degraded") {
      if (firstBatchDoneAt === null) {
        firstBatchDoneAt = performance.now();
      }
      console.log(`7. transform ${event.type}: ${ms(t0)} total, ${eventCount} block-translated events`);
      if (event.type === "degraded") {
        console.log(`   reason: ${event.reason}`);
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`fetch+clean before any LLM: ${(tCleanDone - t0).toFixed(0)} ms`);
  console.log(
    `first partial translation: ${firstPartialAt === null ? "n/a" : `${(firstPartialAt - t0).toFixed(0)} ms`}`,
  );
  console.log(
    `first batch done (~): ${firstBatchDoneAt === null ? "n/a" : `${(firstBatchDoneAt - batchStart).toFixed(0)} ms after first API call`}`,
  );
  console.log(`total pipeline: ${ms(t0)}`);
  console.log(
    `\nEstimated full-paper translation (sequential): ~${((performance.now() - tTransform) / Math.max(chunks.length, 1)).toFixed(0)} ms/batch × ${chunks.length} batches`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
