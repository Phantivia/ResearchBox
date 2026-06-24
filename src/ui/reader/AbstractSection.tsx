import type { Block } from "@/core/ir";
import type { ViewMode } from "@/store";
import { PaperBlockContent } from "./PaperRenderer";

export interface AbstractSectionProps {
  abstract: string;
  blocks: Block[];
  pageUrl: string;
  viewMode: ViewMode;
  translationPending: boolean;
  translationStarted?: boolean;
  debugMode?: boolean;
  streamingDisplays?: Record<string, string>;
}

export function AbstractSection({
  abstract,
  blocks,
  pageUrl,
  viewMode,
  translationPending,
  translationStarted = false,
  debugMode = false,
  streamingDisplays,
}: AbstractSectionProps) {
  if (blocks.length === 0 && !abstract) {
    return null;
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--rb-text-secondary)]">
        Abstract
      </h2>
      {blocks.length > 0 ? (
        <PaperBlockContent
          blocks={blocks}
          pageUrl={pageUrl}
          viewMode={viewMode}
          translationPending={translationPending}
          translationStarted={translationStarted}
          debugMode={debugMode}
          streamingDisplays={streamingDisplays}
          className="paper-content mt-2 leading-relaxed text-[var(--rb-text-primary)]"
        />
      ) : (
        <p className="mt-2 leading-relaxed text-[var(--rb-text-primary)]">{abstract}</p>
      )}
    </section>
  );
}
