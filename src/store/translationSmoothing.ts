import type { TranslationStatus } from "./readerStore";
import {
  computeRevealStep,
  countTranslationTextLength,
  sliceTranslationToTextLength,
} from "@/core/transformer/translationDisplay";

export type TranslationSmoothingSnapshot = {
  translationStatus: TranslationStatus;
  streamingTargets: Record<string, string>;
  streamingCompleteBlocks: Record<string, boolean>;
  streamingDisplays: Record<string, string>;
  getDisplayTranslation: (blockId: string) => string | undefined;
};

export type TranslationSmoothingHost = {
  getSnapshot: () => TranslationSmoothingSnapshot;
  applyDisplays: (updates: Record<string, string>) => void;
  clearStreamingState: () => void;
};

let host: TranslationSmoothingHost | null = null;
let rafId: number | null = null;
let lastTickMs = 0;
const TICK_INTERVAL_MS = 16;

export function registerTranslationSmoothingHost(next: TranslationSmoothingHost): void {
  host = next;
}

function tick(now: number): void {
  rafId = null;

  if (!host) {
    return;
  }

  if (now - lastTickMs < TICK_INTERVAL_MS) {
    scheduleTranslationSmoothing();
    return;
  }
  lastTickMs = now;

  const snapshot = host.getSnapshot();
  const { translationStatus, streamingTargets, streamingCompleteBlocks } = snapshot;

  if (translationStatus !== "translating" || Object.keys(streamingTargets).length === 0) {
    return;
  }

  let needsMore = false;
  const updates: Record<string, string> = {};

  for (const [blockId, target] of Object.entries(streamingTargets)) {
    const current = snapshot.getDisplayTranslation(blockId) ?? "";
    const currentLen = countTranslationTextLength(current);
    const targetLen = countTranslationTextLength(target);

    if (currentLen >= targetLen) {
      continue;
    }

    const backlog = targetLen - currentLen;
    const streamComplete = streamingCompleteBlocks[blockId] ?? false;
    const step = computeRevealStep(backlog, streamComplete);
    const next = sliceTranslationToTextLength(target, currentLen + step);

    if (next !== current) {
      updates[blockId] = next;
    }

    if (countTranslationTextLength(next) < targetLen) {
      needsMore = true;
    }
  }

  if (Object.keys(updates).length > 0) {
    host.applyDisplays(updates);
  }

  if (needsMore) {
    scheduleTranslationSmoothing();
  }
}

export function scheduleTranslationSmoothing(): void {
  if (rafId !== null) {
    return;
  }
  rafId = requestAnimationFrame(tick);
}

export function stopTranslationSmoothing(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function clearTranslationSmoothingState(): void {
  stopTranslationSmoothing();
  if (host) {
    host.clearStreamingState();
  }
}
