import DOMPurify from "dompurify";
import { createContext, memo, useContext, useMemo, useState, type JSX, type KeyboardEvent, type MouseEvent } from "react";
import type { Block, PaperIR, Reference } from "@/core/ir";
import { buildArxivPaperPageUrl, resolveImageUrlsInHtml } from "@/core/media";
import { breakDisplayEquation, mathDisplayMode } from "@/core/math/layout";
import { stripMathmlSourceAnnotations } from "@/core/math/sanitizeMathml";
import {
  getTranslationDebugMetrics,
  type TranslationDebugMetrics,
} from "@/core/transformer";
import type { ViewMode } from "@/store";
import { CitationPopover } from "./CitationPopover";
import { DisplayMath } from "./DisplayMath";
import { FigureBlock } from "./FigureBlock";
import { groupPaperBlocks, type PaperRenderUnit } from "./flowBlocks";
import { MathBlock } from "./MathBlock";
import { MathSpotlight } from "./MathSpotlight";
import { OverflowContainer } from "./OverflowContainer";
import { TableContainer } from "./TableContainer";
import { TranslationWaitingIndicator } from "./TranslationWaitingIndicator";

const FRAGMENT_SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_ATTR: ["encoding", "display", "alttext", "data-ref", "href", "class", "id"],
};

// 已缓存论文的片段可能仍带 LaTeXML 的 x-tex annotation，渲染时一并剔除，
// 避免 Firefox mobile 把裸 TeX 当作重复文本画出来。
stripMathmlSourceAnnotations(DOMPurify);

const TRANSLATABLE_TYPES = new Set<Block["type"]>(["heading", "paragraph", "list", "reference"]);

function isTranslatable(block: Block): boolean {
  return TRANSLATABLE_TYPES.has(block.type);
}

/**
 * Provides the partial/streaming display text for in-flight blocks.
 * Populated by PaperRenderer/PaperBlockContent during active translation.
 * Blocks present here are shown in primary color (streaming); absent blocks
 * fall back to block.translation shown in translation color (complete).
 */
const StreamingDisplaysContext = createContext<Record<string, string>>({});

const SANITIZE_CACHE_LIMIT = 2000;
const sanitizeCache = new Map<string, string>();

function sanitizeHtml(html: string, pageUrl?: string): string {
  const prepared = pageUrl ? resolveImageUrlsInHtml(html, pageUrl) : html;
  const cacheKey = pageUrl ? `${pageUrl}\0${html}` : html;
  const cached = sanitizeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const clean = DOMPurify.sanitize(prepared, FRAGMENT_SANITIZE_OPTIONS);
  if (sanitizeCache.size >= SANITIZE_CACHE_LIMIT) {
    const oldestKey = sanitizeCache.keys().next().value;
    if (oldestKey !== undefined) {
      sanitizeCache.delete(oldestKey);
    }
  }
  sanitizeCache.set(cacheKey, clean);
  return clean;
}

const HEADING_TAGS = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
} as const;

function headingTag(level: number | undefined): (typeof HEADING_TAGS)[keyof typeof HEADING_TAGS] {
  const clamped = Math.min(6, Math.max(1, level ?? 1));
  return HEADING_TAGS[clamped as keyof typeof HEADING_TAGS];
}

function BlockContainer({
  blockId,
  as: Tag = "div",
  className,
  children,
}: {
  blockId: string;
  as?: "div" | "span";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag data-block-id={blockId} className={className}>
      {children}
    </Tag>
  );
}

function UntranslatedMarker() {
  return <span className="ml-2 text-xs text-gray-400">未翻译</span>;
}

function TranslationPlaceholder({ className }: { className?: string }) {
  return <TranslationWaitingIndicator variant="block" className={className} />;
}

function InlineTranslationPlaceholder() {
  return <TranslationWaitingIndicator variant="inline" />;
}

function InlineMath({
  blockId,
  tex,
  display,
}: {
  blockId?: string;
  tex: string;
  display: boolean;
}) {
  const katexDisplay = mathDisplayMode(tex, display);
  const [open, setOpen] = useState(false);

  // display 公式被 flow 吸收后仍按行内字号排版（katexDisplay=false），
  // 但语义上是单行展示公式，给它和块级公式一致的点击放大能力。
  if (!display) {
    return (
      <span {...(blockId ? { "data-block-id": blockId } : {})} className="inline-math">
        <MathBlock tex={tex} display={katexDisplay} />
      </span>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <span {...(blockId ? { "data-block-id": blockId } : {})} className="inline-math">
      <span
        className="rb-inline-display-math"
        role="button"
        tabIndex={0}
        title="点击放大查看公式"
        aria-label="放大查看公式"
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      >
        <MathBlock tex={tex} display={katexDisplay} />
      </span>
      {open && <MathSpotlight tex={tex} onClose={() => setOpen(false)} />}
    </span>
  );
}

function HtmlFragment({
  html,
  tag: Tag,
  className,
  pageUrl,
}: {
  html: string;
  tag: keyof JSX.IntrinsicElements;
  className?: string;
  pageUrl: string;
}) {
  const safeHtml = sanitizeHtml(html, pageUrl);
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}

function TranslationText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <p className={className}>{text}</p>;
}

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)} ms`;
}

function formatTokenSpeed(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(2)} tokens/s`;
}

function TranslationDebugDetails({
  block,
  debugMode,
  className,
}: {
  block: Block;
  debugMode: boolean;
  className?: string;
}) {
  const metrics = getTranslationDebugMetrics(block);
  if (!debugMode || !block.translation || !metrics) {
    return null;
  }

  return (
    <TranslationDebugDetailsView metrics={metrics} className={className} />
  );
}

type AggregatedDebugMetrics = {
  metrics: TranslationDebugMetrics;
  blockCount: number;
};

function minNullable(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length > 0 ? Math.min(...numbers) : null;
}

function aggregateTranslationDebugMetrics(
  blocks: Block[],
): AggregatedDebugMetrics | null {
  const metricsList = blocks
    .map((block) => getTranslationDebugMetrics(block))
    .filter((metrics): metrics is TranslationDebugMetrics => metrics !== undefined);

  if (metricsList.length === 0) {
    return null;
  }

  const first = metricsList[0]!;
  const estimatedOutputTokens = metricsList.reduce(
    (total, metrics) => total + metrics.estimatedOutputTokens,
    0,
  );
  const totalLatencyMs = Math.max(
    ...metricsList.map((metrics) => metrics.totalLatencyMs),
  );
  const firstTranslationLatencyMs = minNullable(
    metricsList.map((metrics) => metrics.firstTranslationLatencyMs),
  );
  const speedDurationSeconds = Math.max(
    ((firstTranslationLatencyMs === null
      ? totalLatencyMs
      : totalLatencyMs - firstTranslationLatencyMs) || totalLatencyMs) / 1000,
    0,
  );

  return {
    blockCount: metricsList.length,
    metrics: {
      ...first,
      blockId: metricsList.map((metrics) => metrics.blockId).join(", "),
      inputChars: metricsList.reduce((total, metrics) => total + metrics.inputChars, 0),
      outputChars: metricsList.reduce((total, metrics) => total + metrics.outputChars, 0),
      estimatedInputTokens: metricsList.reduce(
        (total, metrics) => total + metrics.estimatedInputTokens,
        0,
      ),
      estimatedOutputTokens,
      estimatedTotalTokens: metricsList.reduce(
        (total, metrics) => total + metrics.estimatedTotalTokens,
        0,
      ),
      batchInputTokens: Math.max(...metricsList.map((metrics) => metrics.batchInputTokens)),
      firstTokenLatencyMs: minNullable(
        metricsList.map((metrics) => metrics.firstTokenLatencyMs),
      ),
      firstTranslationLatencyMs,
      totalLatencyMs,
      averageTokenSpeed:
        speedDurationSeconds > 0 ? estimatedOutputTokens / speedDurationSeconds : null,
      streamed: metricsList.some((metrics) => metrics.streamed),
      attempt: Math.max(...metricsList.map((metrics) => metrics.attempt)),
    },
  };
}

function TranslationDebugSummary({
  blocks,
  debugMode,
}: {
  blocks: Block[];
  debugMode: boolean;
}) {
  const aggregated = aggregateTranslationDebugMetrics(blocks);
  if (!debugMode || !aggregated) {
    return null;
  }

  return (
    <TranslationDebugDetailsView
      metrics={aggregated.metrics}
      title={`Debug 信息（${aggregated.blockCount} ${
        aggregated.blockCount === 1 ? "block" : "blocks"
      }）`}
      className="mt-2"
    />
  );
}

function TranslationDebugDetailsView({
  metrics,
  title = "Debug 信息",
  className,
}: {
  metrics: TranslationDebugMetrics;
  title?: string;
  className?: string;
}) {
  return (
    <details
      className={`not-prose rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 ${className ?? ""}`}
    >
      <summary className="cursor-pointer select-none font-medium text-slate-600">
        {title}
      </summary>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="font-medium">首响应 token 延迟</dt>
          <dd>{formatMs(metrics.firstTokenLatencyMs)}</dd>
        </div>
        <div>
          <dt className="font-medium">首译文 token 延迟</dt>
          <dd>{formatMs(metrics.firstTranslationLatencyMs)}</dd>
        </div>
        <div>
          <dt className="font-medium">估算 token 消耗</dt>
          <dd>
            ~{metrics.estimatedTotalTokens} total ({metrics.estimatedInputTokens} in /{" "}
            {metrics.estimatedOutputTokens} out)
          </dd>
        </div>
        <div>
          <dt className="font-medium">平均 token 速度</dt>
          <dd>{formatTokenSpeed(metrics.averageTokenSpeed)}</dd>
        </div>
        <div>
          <dt className="font-medium">总耗时</dt>
          <dd>{formatMs(metrics.totalLatencyMs)}</dd>
        </div>
        <div>
          <dt className="font-medium">模型</dt>
          <dd>
            {metrics.providerId} / {metrics.modelLabel}
          </dd>
        </div>
        <div>
          <dt className="font-medium">批次</dt>
          <dd>
            #{metrics.batchIndex + 1}, attempt {metrics.attempt},{" "}
            {metrics.streamed ? "stream" : "non-stream"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">字符数</dt>
          <dd>
            {metrics.inputChars} in / {metrics.outputChars} out
          </dd>
        </div>
      </dl>
    </details>
  );
}

function renderTranslationSlot({
  block,
  viewMode,
  translationPending,
  translationStarted,
  streamingDisplay,
  renderOriginal,
  renderTranslation,
}: {
  block: Block;
  viewMode: ViewMode;
  translationPending: boolean;
  translationStarted: boolean;
  /** Partial text being streamed for this block. When set, renders in primary color. */
  streamingDisplay?: string;
  renderOriginal: () => React.ReactNode;
  /** Receives (text, isStreaming) — caller should use primary color when isStreaming=true. */
  renderTranslation: (text: string, isStreaming: boolean) => React.ReactNode;
}) {
  const effectiveText = streamingDisplay ?? block.translation;
  const isStreaming = Boolean(streamingDisplay);

  if (effectiveText) {
    return renderTranslation(effectiveText, isStreaming);
  }

  if (translationPending) {
    return (
      <TranslationPlaceholder
        className={viewMode === "bilingual" ? "mt-2" : undefined}
      />
    );
  }

  if (!translationStarted) {
    if (viewMode === "translation") {
      return renderOriginal();
    }
    return null;
  }

  if (viewMode === "translation") {
    return (
      <div className="opacity-60">
        {renderOriginal()}
        <UntranslatedMarker />
      </div>
    );
  }

  return (
    <div className="mt-2">
      <UntranslatedMarker />
    </div>
  );
}

const BlockRenderer = memo(function BlockRenderer({
  block,
  viewMode,
  translationPending,
  translationStarted,
  debugMode,
  pageUrl,
}: {
  block: Block;
  viewMode: ViewMode;
  translationPending: boolean;
  translationStarted: boolean;
  debugMode: boolean;
  pageUrl: string;
}) {
  const streamingDisplays = useContext(StreamingDisplaysContext);
  const streamingDisplay = streamingDisplays[block.id];
  const translatable = isTranslatable(block);
  const showOriginal =
    viewMode === "original" ||
    viewMode === "bilingual" ||
    (viewMode === "translation" && !translatable);
  const showTranslationSlot =
    translatable && (viewMode === "translation" || viewMode === "bilingual");

  switch (block.type) {
    case "heading": {
      const Tag = headingTag(block.level);
      const original = <Tag>{block.content}</Tag>;
      return (
        <BlockContainer blockId={block.id} className="my-4 font-semibold">
          {showOriginal && original}
          {showTranslationSlot &&
            renderTranslationSlot({
              block,
              viewMode,
              translationPending,
              translationStarted,
              streamingDisplay,
              renderOriginal: () => original,
              renderTranslation: (text, isStreaming) => (
                <Tag className={
                  viewMode === "bilingual"
                    ? `mt-1 ${isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"}`
                    : isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"
                }>
                  {text}
                </Tag>
              ),
            })}
          {showTranslationSlot && (
            <TranslationDebugDetails block={block} debugMode={debugMode} className="mt-2" />
          )}
        </BlockContainer>
      );
    }
    case "paragraph": {
      const original = (
        <HtmlFragment html={block.content} tag="p" className="leading-relaxed" pageUrl={pageUrl} />
      );
      return (
        <BlockContainer blockId={block.id} className="my-3 leading-relaxed">
          {showOriginal && original}
          {showTranslationSlot &&
            renderTranslationSlot({
              block,
              viewMode,
              translationPending,
              translationStarted,
              streamingDisplay,
              renderOriginal: () => original,
              renderTranslation: (text, isStreaming) => (
                <HtmlFragment
                  html={text}
                  tag="p"
                  pageUrl={pageUrl}
                  className={
                    viewMode === "bilingual"
                      ? `mt-2 leading-relaxed ${isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"}`
                      : `leading-relaxed ${isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"}`
                  }
                />
              ),
            })}
          {showTranslationSlot && (
            <TranslationDebugDetails block={block} debugMode={debugMode} className="mt-2" />
          )}
        </BlockContainer>
      );
    }
    case "list": {
      const original = <HtmlFragment html={block.content} tag="div" pageUrl={pageUrl} />;
      return (
        <BlockContainer blockId={block.id} className="my-3">
          {showOriginal && original}
          {showTranslationSlot &&
            renderTranslationSlot({
              block,
              viewMode,
              translationPending,
              translationStarted,
              streamingDisplay,
              renderOriginal: () => original,
              renderTranslation: (text, isStreaming) => (
                <HtmlFragment
                  html={text}
                  tag="div"
                  pageUrl={pageUrl}
                  className={
                    viewMode === "bilingual"
                      ? `mt-2 ${isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"}`
                      : isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"
                  }
                />
              ),
            })}
          {showTranslationSlot && (
            <TranslationDebugDetails block={block} debugMode={debugMode} className="mt-2" />
          )}
        </BlockContainer>
      );
    }
    case "reference": {
      const original = <span>{block.content}</span>;
      return (
        <BlockContainer blockId={block.id} className="my-2 text-sm text-gray-700">
          {showOriginal && original}
          {showTranslationSlot &&
            renderTranslationSlot({
              block,
              viewMode,
              translationPending,
              translationStarted,
              streamingDisplay,
              renderOriginal: () => original,
              renderTranslation: (text, isStreaming) => (
                <TranslationText
                  text={text}
                  className={
                    viewMode === "bilingual"
                      ? `mt-2 ${isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"}`
                      : isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"
                  }
                />
              ),
            })}
          {showTranslationSlot && (
            <TranslationDebugDetails block={block} debugMode={debugMode} className="mt-2" />
          )}
        </BlockContainer>
      );
    }
    case "math":
      if (block.math) {
        if (block.math.display) {
          return (
            <BlockContainer blockId={block.id} className="my-4">
              <DisplayMath
                tex={breakDisplayEquation(block.math.tex)}
                display={block.math.display}
              />
            </BlockContainer>
          );
        }

        return (
          <BlockContainer blockId={block.id} className="my-3 leading-relaxed">
            <p className="m-0 leading-relaxed">
              <InlineMath tex={block.math.tex} display={block.math.display} />
            </p>
          </BlockContainer>
        );
      }
      return (
        <BlockContainer blockId={block.id} className="my-3">
          <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content, pageUrl) }} />
        </BlockContainer>
      );
    case "table":
      return (
        <BlockContainer blockId={block.id} className="my-4">
          <TableContainer>
            <div
              className="min-w-0"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content, pageUrl) }}
            />
          </TableContainer>
        </BlockContainer>
      );
    case "figure": {
      // 图像始终显示原图（含原图注）；译文图注在译文/双语模式下追加到图下方。
      const hasCaption = Boolean(block.caption?.trim());
      const showCaptionTranslation =
        hasCaption && (viewMode === "translation" || viewMode === "bilingual");
      const figureHtml = block.content.trim();
      const figureTag = /^<figure[\s>]/i.test(figureHtml) ? "div" : "figure";
      return (
        <BlockContainer blockId={block.id} className="my-6">
          <FigureBlock>
            <HtmlFragment html={figureHtml} tag={figureTag} pageUrl={pageUrl} />
          </FigureBlock>
          {showCaptionTranslation &&
            renderTranslationSlot({
              block,
              viewMode,
              translationPending,
              translationStarted,
              streamingDisplay,
              renderOriginal: () => null,
              renderTranslation: (text, isStreaming) => (
                <HtmlFragment
                  html={text}
                  tag="figcaption"
                  pageUrl={pageUrl}
                  className={`mt-2 text-sm leading-relaxed ${isStreaming ? "text-[var(--rb-primary)]" : "text-[var(--rb-translation)]"}`}
                />
              ),
            })}
          {showCaptionTranslation && (
            <TranslationDebugDetails block={block} debugMode={debugMode} className="mt-2" />
          )}
        </BlockContainer>
      );
    }
    case "codeblock":
      return (
        <BlockContainer blockId={block.id} className="my-4">
          <OverflowContainer
            as="pre"
            className="rounded-lg border border-[var(--rb-border)] bg-[color-mix(in_srgb,var(--rb-border)_38%,var(--rb-page-bg))] p-4 text-sm text-[var(--rb-text-primary)] whitespace-pre"
          >
            <code>{block.content}</code>
          </OverflowContainer>
        </BlockContainer>
      );
    default:
      return (
        <BlockContainer blockId={block.id} className="my-3">
          <span>{block.content}</span>
        </BlockContainer>
      );
  }
});

const FlowOriginalPart = memo(function FlowOriginalPart({
  block,
  pageUrl,
}: {
  block: Block;
  pageUrl: string;
}) {
  if (block.type === "paragraph") {
    return (
      <span
        data-block-id={block.id}
        className="inline"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content, pageUrl) }}
      />
    );
  }

  if (block.type === "math" && block.math) {
    return (
      <InlineMath blockId={block.id} tex={block.math.tex} display={block.math.display} />
    );
  }

  return null;
});

function shouldShowFlowMathInTranslation(
  blocks: Block[],
  viewMode: ViewMode,
  translationPending: boolean,
  translationStarted: boolean,
): boolean {
  if (translationPending || translationStarted) return true;
  if (viewMode === "translation") return true;
  return blocks.some(
    (candidate) => candidate.type === "paragraph" && Boolean(candidate.translation),
  );
}

const FlowTranslationPart = memo(function FlowTranslationPart({
  block,
  viewMode,
  translationPending,
  translationStarted,
  showFlowMathInTranslation,
  pageUrl,
}: {
  block: Block;
  viewMode: ViewMode;
  translationPending: boolean;
  translationStarted: boolean;
  showFlowMathInTranslation: boolean;
  pageUrl: string;
}) {
  const streamingDisplays = useContext(StreamingDisplaysContext);
  const streamingDisplay = block.type === "paragraph" ? streamingDisplays[block.id] : undefined;

  if (block.type === "math" && block.math) {
    if (!showFlowMathInTranslation) return null;
    return <InlineMath tex={block.math.tex} display={block.math.display} />;
  }

  if (block.type !== "paragraph") return null;

  const effectiveText = streamingDisplay ?? block.translation;

  if (effectiveText) {
    return (
      <span
        className={streamingDisplay ? "inline text-[var(--rb-primary)]" : "inline"}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(effectiveText, pageUrl) }}
      />
    );
  }

  if (translationPending) {
    return <InlineTranslationPlaceholder key={`${block.id}-pending`} />;
  }

  if (!translationStarted) {
    if (viewMode === "translation") {
      return (
        <span key={block.id} data-block-id={block.id} className="inline">
          <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content, pageUrl) }} />
        </span>
      );
    }
    return null;
  }

  if (viewMode === "translation") {
    return (
      <span key={block.id} data-block-id={block.id} className="inline opacity-60">
        <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content, pageUrl) }} />
        <UntranslatedMarker />
      </span>
    );
  }

  return (
    <span key={block.id} className="inline">
      <UntranslatedMarker />
    </span>
  );
});

function FlowGroupRenderer({
  blocks,
  viewMode,
  translationPending,
  translationStarted,
  debugMode,
  pageUrl,
}: {
  blocks: Block[];
  viewMode: ViewMode;
  translationPending: boolean;
  translationStarted: boolean;
  debugMode: boolean;
  pageUrl: string;
}) {
  const showOriginal = viewMode === "original" || viewMode === "bilingual";
  const showTranslationRow = viewMode === "bilingual" || viewMode === "translation";
  const showFlowMathInTranslation = shouldShowFlowMathInTranslation(
    blocks,
    viewMode,
    translationPending,
    translationStarted,
  );

  return (
    <div className="flow-group my-3">
      {showOriginal && (
        <p className="flow-line leading-relaxed">
          {blocks.map((block) => (
            <FlowOriginalPart key={block.id} block={block} pageUrl={pageUrl} />
          ))}
        </p>
      )}
      {showTranslationRow && (
        <p
          className={
            viewMode === "bilingual"
              ? "flow-line mt-2 leading-relaxed text-[var(--rb-translation)]"
              : "flow-line leading-relaxed text-[var(--rb-translation)]"
          }
        >
          {blocks.map((block) => (
            <FlowTranslationPart
              key={`${block.id}-translation`}
              block={block}
              viewMode={viewMode}
              translationPending={translationPending}
              translationStarted={translationStarted}
              showFlowMathInTranslation={showFlowMathInTranslation}
              pageUrl={pageUrl}
            />
          ))}
        </p>
      )}
      {showTranslationRow && (
        <TranslationDebugSummary blocks={blocks} debugMode={debugMode} />
      )}
    </div>
  );
}

function RenderUnit({
  unit,
  viewMode,
  translationPending,
  translationStarted,
  debugMode,
  pageUrl,
}: {
  unit: PaperRenderUnit;
  viewMode: ViewMode;
  translationPending: boolean;
  translationStarted: boolean;
  debugMode: boolean;
  pageUrl: string;
}) {
  if (unit.kind === "flow") {
    return (
      <FlowGroupRenderer
        blocks={unit.blocks}
        viewMode={viewMode}
        translationPending={translationPending}
        translationStarted={translationStarted}
        debugMode={debugMode}
        pageUrl={pageUrl}
      />
    );
  }

  return (
    <BlockRenderer
      block={unit.block}
      viewMode={viewMode}
      translationPending={translationPending}
      translationStarted={translationStarted}
      debugMode={debugMode}
      pageUrl={pageUrl}
    />
  );
}

function ReferenceEntry({ reference }: { reference: Reference }) {
  return (
    <div data-block-id={reference.id} className="my-2 text-sm leading-relaxed">
      <span className="mr-2 font-medium">{reference.label}</span>
      <span>{reference.text}</span>
    </div>
  );
}

type ActiveCitation = {
  anchor: HTMLElement;
  referenceId: string;
};

function resolveCitationFromClick(
  target: EventTarget | null,
  referenceById: ReadonlyMap<string, Reference>,
): ActiveCitation | null {
  if (!(target instanceof Element)) return null;

  const cite = target.closest("cite[data-ref]");
  if (!(cite instanceof HTMLElement)) return null;

  const referenceId = cite.getAttribute("data-ref");
  if (!referenceId || !referenceById.has(referenceId)) return null;

  // TODO: branch on data-ref-kind for equation / figure / table cross-refs
  return { anchor: cite, referenceId };
}

function CitationInteractionLayer({
  references,
  children,
}: {
  references: Reference[];
  children: React.ReactNode;
}) {
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(null);

  const referenceById = useMemo(
    () => new Map(references.map((reference) => [reference.id, reference])),
    [references],
  );

  const handleContentClick = (event: MouseEvent<HTMLElement>) => {
    const citation = resolveCitationFromClick(event.target, referenceById);
    if (!citation) return;

    event.preventDefault();

    setActiveCitation((current) =>
      current?.anchor === citation.anchor && current.referenceId === citation.referenceId
        ? null
        : citation,
    );
  };

  const activeReference = activeCitation
    ? referenceById.get(activeCitation.referenceId)
    : undefined;

  return (
    <div
      onClick={handleContentClick}
      className="[&_cite[data-ref]]:cursor-pointer [&_cite[data-ref]_a]:no-underline"
    >
      {children}
      {activeCitation && activeReference && (
        <CitationPopover
          open
          anchor={activeCitation.anchor}
          reference={activeReference}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </div>
  );
}

export interface PaperBlockContentProps {
  blocks: Block[];
  pageUrl: string;
  viewMode?: ViewMode;
  translationPending?: boolean;
  translationStarted?: boolean;
  debugMode?: boolean;
  className?: string;
  /** Partial streaming text keyed by block id. Shown in primary color. */
  streamingDisplays?: Record<string, string>;
}

export function PaperBlockContent({
  blocks,
  pageUrl,
  viewMode = "original",
  translationPending = false,
  translationStarted = false,
  debugMode = false,
  className,
  streamingDisplays,
}: PaperBlockContentProps) {
  const renderUnits = useMemo(() => groupPaperBlocks(blocks), [blocks]);

  return (
    <StreamingDisplaysContext.Provider value={streamingDisplays ?? {}}>
      <div className={className}>
        {renderUnits.map((unit) => (
          <RenderUnit
            key={unit.kind === "flow" ? unit.blocks.map((block) => block.id).join("-") : unit.block.id}
            unit={unit}
            viewMode={viewMode}
            translationPending={translationPending}
            translationStarted={translationStarted}
            debugMode={debugMode}
            pageUrl={pageUrl}
          />
        ))}
      </div>
    </StreamingDisplaysContext.Provider>
  );
}

export interface PaperRendererProps {
  paper: PaperIR;
  viewMode?: ViewMode;
  translationPending?: boolean;
  translationStarted?: boolean;
  debugMode?: boolean;
  /** Partial streaming text keyed by block id. Shown in primary color. */
  streamingDisplays?: Record<string, string>;
}

export function PaperRenderer({
  paper,
  viewMode = "original",
  translationPending = false,
  translationStarted = false,
  debugMode = false,
  streamingDisplays,
}: PaperRendererProps) {
  const renderUnits = useMemo(() => groupPaperBlocks(paper.blocks), [paper.blocks]);
  const pageUrl = useMemo(
    () => buildArxivPaperPageUrl(paper.arxivId, paper.version),
    [paper.arxivId, paper.version],
  );

  return (
    <CitationInteractionLayer references={paper.references}>
      <StreamingDisplaysContext.Provider value={streamingDisplays ?? {}}>
      <article className="paper-content prose prose-gray max-w-none">
        {renderUnits.map((unit) => (
          <RenderUnit
            key={unit.kind === "flow" ? unit.blocks.map((block) => block.id).join("-") : unit.block.id}
            unit={unit}
            viewMode={viewMode}
            translationPending={translationPending}
            translationStarted={translationStarted}
            debugMode={debugMode}
            pageUrl={pageUrl}
          />
        ))}
        {paper.references.length > 0 && (
          <section className="mt-10 border-t border-gray-200 pt-6">
            <h2 className="mb-4 text-xl font-semibold">References</h2>
            {paper.references.map((reference) => (
              <ReferenceEntry key={reference.id} reference={reference} />
            ))}
          </section>
        )}
      </article>
      </StreamingDisplaysContext.Provider>
    </CitationInteractionLayer>
  );
}
