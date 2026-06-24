import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { NoHtmlVersionError } from "@/core/fetcher";
import type { MessageKey } from "@/core/i18n";
import { OfflineUncachedError } from "@/core/network";
import {
  InvalidArxivIdError,
  loadPaperForDisplay,
  type LoadPaperWithTranslationProgress,
} from "@/core/pipeline/loadPaper";
import { resolvePaperEntryStatus } from "@/core/paper";
import { readerRightPanelWidth } from "@/core/reader";
import { extractToc } from "@/core/toc";
import { buildArxivPaperPageUrl } from "@/core/media";
import { useTranslation } from "@/i18n";
import {
  usePaperStore,
  useReaderStore,
  useReaderTocStore,
  useSettingsStore,
  useTranslationJobStore,
} from "@/store";
import type { TranslationStatus } from "@/store/readerStore";
import { PaperRenderer } from "@/ui/reader/PaperRenderer";
import { AbstractSection } from "@/ui/reader/AbstractSection";
import { AnnotationLayer } from "@/ui/reader/AnnotationLayer";
import { TranslationProgressRing } from "@/ui/reader/TranslationProgressRing";
import { ViewModeSwitcher } from "@/ui/reader/ViewModeSwitcher";
import {
  MobileTocPanel,
  ReaderPanelResizeHandle,
  TocFloatingButton,
  TocRail,
  useActiveHeading,
} from "@/ui/reader/toc";

function resolveErrorMessage(
  error: unknown,
  t: (key: MessageKey) => string,
): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "";
  }
  if (error instanceof OfflineUncachedError) {
    return t("reader.error.offlineUncached");
  }
  if (error instanceof NoHtmlVersionError) {
    return t("reader.error.noHtml");
  }
  if (error instanceof InvalidArxivIdError) {
    return t("reader.error.invalidId");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return t("reader.error.unknown");
}

function translationStatusLabel(
  status: TranslationStatus,
  t: (key: MessageKey) => string,
): string | null {
  switch (status) {
    case "cached":
      return t("reader.status.cached");
    case "partial":
      return t("reader.status.partial");
    case "translating":
      return t("reader.status.translating");
    case "done":
      return t("reader.status.done");
    case "degraded":
      return t("reader.status.degraded");
    default:
      return null;
  }
}

function applyTranslationEvent(
  event: LoadPaperWithTranslationProgress,
  handlers: {
    setPaperFromCache: ReturnType<typeof useReaderStore.getState>["setPaperFromCache"];
    setPaperStructure: ReturnType<typeof useReaderStore.getState>["setPaperStructure"];
    setStreamingTarget: ReturnType<typeof useReaderStore.getState>["setStreamingTarget"];
    setPaperDone: ReturnType<typeof useReaderStore.getState>["setPaperDone"];
    setDegraded: ReturnType<typeof useReaderStore.getState>["setDegraded"];
    recordPaper: (
      projectId: string,
      routeId: string,
      ir: Parameters<
        ReturnType<typeof usePaperStore.getState>["recordPaper"]
      >[2],
      status: Parameters<
        ReturnType<typeof usePaperStore.getState>["recordPaper"]
      >[3],
    ) => void;
    projectId: string;
    routeId: string;
  },
): void {
  switch (event.type) {
    case "cache-hit":
      handlers.setPaperFromCache(event.ir);
      void handlers.recordPaper(handlers.projectId, handlers.routeId, event.ir, "done");
      break;
    case "structure":
      handlers.setPaperStructure(event.ir);
      void handlers.recordPaper(
        handlers.projectId,
        handlers.routeId,
        event.ir,
        "processing",
      );
      break;
    case "block-translated":
      handlers.setStreamingTarget(
        event.blockId,
        event.translation,
        !event.partial,
        event.debugMetrics,
      );
      break;
    case "done":
      handlers.setPaperDone(event.ir);
      void handlers.recordPaper(handlers.projectId, handlers.routeId, event.ir, "done");
      break;
    case "degraded":
      handlers.setDegraded(event.ir, event.reason);
      void handlers.recordPaper(handlers.projectId, handlers.routeId, event.ir, "done");
      break;
  }
}

export function Reader() {
  const { projectId = "", routeId: rawId } = useParams<{
    projectId: string;
    routeId: string;
  }>();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const paperBoxPath = `/p/${encodeURIComponent(projectId)}/paper-box`;
  const { t } = useTranslation();
  const {
    currentPaper,
    status,
    translationStatus,
    degradedReason,
    error,
    streamingDisplays,
    setLoading,
    setError,
    setPaper,
    setPaperFromCache,
    setTranslating,
    reset,
  } = useReaderStore();
  const {
    load,
    loaded,
    hasActiveProvider,
    getActiveProvider,
    targetLang,
    viewMode,
    debugMode,
    setViewMode,
  } = useSettingsStore();
  const {
    recordProcessing,
    recordPaper,
    recordError,
  } = usePaperStore();
  const translationJob = useTranslationJobStore((state) =>
    id ? state.jobs[id] : undefined,
  );
  const startTranslation = useTranslationJobStore((state) => state.startTranslation);
  const cancelTranslation = useTranslationJobStore((state) => state.cancelTranslation);
  const subscribeTranslation = useTranslationJobStore((state) => state.subscribe);
  const getTranslationJob = useTranslationJobStore((state) => state.getJob);
  const displayAbortRef = useRef<AbortController | null>(null);
  const previousRouteIdRef = useRef<string | null>(null);
  const [readonlyNotice, setReadonlyNotice] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const runDisplayLoad = useCallback(
    async (softAttach = false) => {
      if (!id) {
        setError(t("reader.error.missingId"));
        return;
      }

      displayAbortRef.current?.abort();
      const controller = new AbortController();
      displayAbortRef.current = controller;

      if (!softAttach) {
        reset();
        setLoading();
      }

      setReadonlyNotice(false);

      if (!softAttach) {
        void recordProcessing(projectId, id);
      }

      try {
        const result = await loadPaperForDisplay(id);
        if (controller.signal.aborted) {
          return;
        }

        if (result.kind === "cache") {
          setPaperFromCache(result.ir);
        } else {
          setPaper(result.ir);
        }

        if (!hasActiveProvider()) {
          setReadonlyNotice(true);
        }

        if (!softAttach) {
          void recordPaper(
            projectId,
            id,
            result.ir,
            resolvePaperEntryStatus(result.ir),
          );
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        const message = resolveErrorMessage(err, t);
        if (message) {
          setError(message);
          void recordError(projectId, id, message);
        }
      }
    },
    [
      projectId,
      id,
      reset,
      setLoading,
      setError,
      setPaper,
      setPaperFromCache,
      hasActiveProvider,
      setReadonlyNotice,
      recordProcessing,
      recordPaper,
      recordError,
      t,
    ],
  );

  const runDisplayLoadRef = useRef(runDisplayLoad);
  runDisplayLoadRef.current = runDisplayLoad;

  useEffect(() => {
    if (!loaded) {
      return;
    }

    const routeChanged =
      previousRouteIdRef.current !== null && previousRouteIdRef.current !== id;
    previousRouteIdRef.current = id;

    const activeJob = getTranslationJob(id);
    const softAttach = !routeChanged && activeJob?.status === "running";
    void runDisplayLoadRef.current(softAttach);

    return () => {
      displayAbortRef.current?.abort();
    };
  }, [id, loaded, getTranslationJob]);

  const handleTranslationEvent = useCallback(
    (event: LoadPaperWithTranslationProgress) => {
      applyTranslationEvent(event, {
        setPaperFromCache: useReaderStore.getState().setPaperFromCache,
        setPaperStructure: useReaderStore.getState().setPaperStructure,
        setStreamingTarget: useReaderStore.getState().setStreamingTarget,
        setPaperDone: useReaderStore.getState().setPaperDone,
        setDegraded: useReaderStore.getState().setDegraded,
        recordPaper,
        projectId,
        routeId: id,
      });
    },
    [projectId, id, recordPaper],
  );

  useEffect(() => {
    if (!id) {
      return;
    }

    return subscribeTranslation(id, handleTranslationEvent);
  }, [id, subscribeTranslation, handleTranslationEvent]);

  useEffect(() => {
    if (!translationJob?.error) {
      return;
    }
    setError(translationJob.error);
    void recordError(projectId, id, translationJob.error);
  }, [translationJob?.error, projectId, id, setError, recordError]);

  const tocEntries = useMemo(
    () => (currentPaper ? extractToc(currentPaper) : []),
    [currentPaper],
  );
  const paperPageUrl = useMemo(
    () =>
      currentPaper
        ? buildArxivPaperPageUrl(currentPaper.arxivId, currentPaper.version)
        : "",
    [currentPaper],
  );
  const setTocEntries = useReaderTocStore((state) => state.setEntries);
  const resetToc = useReaderTocStore((state) => state.reset);
  const annotationPanelWidth = useReaderTocStore((state) => state.annotationPanelWidth);
  const rightPanelWidth = readerRightPanelWidth(annotationPanelWidth);

  useEffect(() => {
    setTocEntries(tocEntries);
  }, [tocEntries, setTocEntries]);

  useEffect(() => resetToc, [resetToc]);

  useActiveHeading(tocEntries);

  const launchTranslation = useCallback(
    (forceRefresh: boolean) => {
      if (!id) {
        setError(t("reader.error.missingId"));
        return;
      }

      const providerConfig = getActiveProvider();
      if (!providerConfig || !hasActiveProvider()) {
        setReadonlyNotice(true);
        return;
      }

      setTranslating();
      void recordProcessing(projectId, id);
      startTranslation({
        projectId,
        routeId: id,
        forceRefresh,
        providerConfig,
        targetLang,
        debugMode,
      });
    },
    [
      id,
      projectId,
      getActiveProvider,
      hasActiveProvider,
      setError,
      setTranslating,
      setReadonlyNotice,
      recordProcessing,
      startTranslation,
      targetLang,
      debugMode,
      t,
    ],
  );

  const handleCancel = () => {
    cancelTranslation(id);
    const paper = useReaderStore.getState().currentPaper;
    if (paper) {
      useReaderStore.getState().setPaperFromCache(paper);
    }
  };

  const handleStartTranslation = () => {
    if (!hasActiveProvider()) {
      setReadonlyNotice(true);
      return;
    }
    launchTranslation(false);
  };

  const handleRetransform = () => {
    if (!hasActiveProvider()) {
      setReadonlyNotice(true);
      return;
    }
    launchTranslation(true);
  };

  const isTranslating =
    translationStatus === "translating" || translationJob?.status === "running";
  const translationStarted = isTranslating || translationStatus !== "none";
  const isBusy = status === "loading" || isTranslating;
  const statusLabel = translationStatusLabel(translationStatus, t);
  const progressTotal = translationJob?.totalBlocks ?? 0;
  const progressCompleted = translationJob?.completedBlocks ?? 0;
  const canStartTranslation =
    hasActiveProvider() &&
    !isBusy &&
    (translationStatus === "none" || translationStatus === "partial");
  const canRetransform =
    hasActiveProvider() &&
    !isBusy &&
    (translationStatus === "cached" ||
      translationStatus === "done" ||
      translationStatus === "degraded");

  if (status === "loading" || status === "idle") {
    return (
      <main className="min-h-screen overflow-x-clip bg-[var(--rb-card-bg)]">
        <div className="mx-auto min-w-0 max-w-3xl px-4 py-12">
          <div className="flex items-center gap-3 text-[var(--rb-text-secondary)]">
            <span
              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--rb-primary)]"
              aria-hidden
            />
            <span>{t("reader.loading")}</span>
          </div>
          <div className="mt-8 space-y-4">
            <div className="h-8 w-3/4 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
            <div className="h-24 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-x-clip bg-[var(--rb-card-bg)] px-4">
        <div className="min-w-0 max-w-md text-center">
          <p className="text-lg text-red-600" role="alert">
            {error}
          </p>
          <Link
            to={paperBoxPath}
            className="mt-4 inline-block text-[var(--rb-primary)] hover:underline"
          >
            {t("common.backToPaperBox")}
          </Link>
        </div>
      </main>
    );
  }

  if (!currentPaper) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[var(--rb-card-bg)]">
      <TocRail />
      <ReaderPanelResizeHandle />
      <TocFloatingButton />
      <MobileTocPanel />
      <div
        className="min-w-0 xl:[margin-right:var(--rb-reader-right-panel)]"
        style={{ ["--rb-reader-right-panel" as string]: `${rightPanelWidth}px` }}
      >
        <div className="mx-auto min-w-0 max-w-6xl px-4 py-10 xl:max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link to={paperBoxPath} className="text-sm text-[var(--rb-primary)] hover:underline">
            {t("common.backToPaperBox")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            {isTranslating && progressTotal > 0 && (
              <TranslationProgressRing
                completed={progressCompleted}
                total={progressTotal}
              />
            )}
            {statusLabel && (
              <span className="text-sm text-[var(--rb-text-secondary)]">{statusLabel}</span>
            )}
            <Link to="/settings" className="text-sm text-[var(--rb-primary)] hover:underline">
              {t("common.settings")}
            </Link>
            {isTranslating && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-[var(--rb-border)] px-3 py-1.5 text-sm font-medium text-[var(--rb-text-primary)] hover:bg-[var(--rb-page-bg)]"
              >
                {t("common.cancel")}
              </button>
            )}
            {canStartTranslation && (
              <button
                type="button"
                onClick={handleStartTranslation}
                className="rounded-lg bg-[var(--rb-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--rb-primary-hover)]"
              >
                {translationStatus === "partial"
                  ? t("reader.continueTranslation")
                  : t("reader.startTranslation")}
              </button>
            )}
            {canRetransform && (
              <button
                type="button"
                onClick={handleRetransform}
                className="rounded-lg border border-[var(--rb-primary)] px-3 py-1.5 text-sm font-medium text-[var(--rb-primary)] hover:bg-blue-50"
              >
                {t("reader.retransform")}
              </button>
            )}
          </div>
        </div>

        {readonlyNotice && (
          <div
            className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            <p>{t("reader.readonlyNotice")}</p>
            <Link
              to="/settings"
              className="mt-2 inline-block font-medium text-[var(--rb-primary)] hover:underline"
            >
              {t("reader.readonlyNoticeLink")}
            </Link>
          </div>
        )}

        {translationStatus === "degraded" && degradedReason && (
          <div
            className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            {degradedReason}
          </div>
        )}

        <header className="mb-8 border-b border-[var(--rb-border)] pb-6">
          <h1 className="break-words text-3xl font-bold leading-tight text-[var(--rb-text-primary)]">
            {currentPaper.title}
          </h1>
          {currentPaper.authors.length > 0 && (
            <p className="mt-3 text-[var(--rb-text-secondary)]">{currentPaper.authors.join(", ")}</p>
          )}
          <AbstractSection
            abstract={currentPaper.abstract}
            blocks={currentPaper.abstractBlocks}
            pageUrl={paperPageUrl}
            viewMode={viewMode}
            translationPending={isTranslating}
            translationStarted={translationStarted}
            debugMode={debugMode}
            streamingDisplays={streamingDisplays}
          />
        </header>

        <div className="mb-6">
          <ViewModeSwitcher value={viewMode} onChange={(mode) => void setViewMode(mode)} />
        </div>

        <AnnotationLayer paper={currentPaper} projectId={projectId}>
          <PaperRenderer
            paper={currentPaper}
            viewMode={viewMode}
            translationPending={isTranslating}
            translationStarted={translationStarted}
            debugMode={debugMode}
            streamingDisplays={streamingDisplays}
          />
        </AnnotationLayer>
        </div>
      </div>
    </main>
  );
}
