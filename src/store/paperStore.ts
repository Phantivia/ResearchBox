import { create } from "zustand";
import { extractArxivIdFromInput, parseArxivId } from "@/core/fetcher";
import type { PaperIR } from "@/core/ir";
import { PaperSchema, type Paper, type PaperStatus } from "@/core/paper";
import {
  deletePaperEntry,
  getPaperEntry,
  listPaperEntries,
  putPaperEntry,
  savePaper,
} from "@/db";

interface PaperState {
  projectId: string | null;
  papers: Paper[];
  loaded: boolean;
}

interface PaperActions {
  loadForProject: (projectId: string) => Promise<void>;
  /** Parse an input URL/ID, create or refresh a processing paper, return its route id. */
  addInput: (projectId: string, source: string) => Promise<string | null>;
  recordProcessing: (
    projectId: string,
    routeId: string,
    source?: string,
  ) => Promise<void>;
  recordPaper: (
    projectId: string,
    routeId: string,
    ir: PaperIR,
    status: PaperStatus,
  ) => Promise<void>;
  recordError: (
    projectId: string,
    routeId: string,
    message: string,
  ) => Promise<void>;
  remove: (projectId: string, routeId: string) => Promise<void>;
}

function routeIdFor(arxivId: string, version: string | null): string {
  return version ? `${arxivId}${version}` : arxivId;
}

function sortByUpdated(papers: Paper[]): Paper[] {
  return [...papers].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function upsert(
  projectId: string,
  routeId: string,
  patch: Partial<Paper> & Pick<Paper, "arxivId" | "version">,
): Promise<Paper> {
  const now = Date.now();
  const existing = await getPaperEntry(projectId, routeId);
  const next = PaperSchema.parse({
    importMethod: "arxiv-html",
    title: "",
    authors: [],
    createdAt: existing?.createdAt ?? now,
    source: routeId,
    ...existing,
    ...patch,
    projectId,
    routeId,
    updatedAt: now,
  });
  await putPaperEntry(next);
  return next;
}

export const usePaperStore = create<PaperState & PaperActions>()((set, get) => {
  function replace(paper: Paper) {
    set((state) => {
      if (state.projectId !== paper.projectId) {
        return {};
      }
      const rest = state.papers.filter((item) => item.routeId !== paper.routeId);
      return { papers: sortByUpdated([paper, ...rest]) };
    });
  }

  return {
    projectId: null,
    papers: [],
    loaded: false,

    loadForProject: async (projectId) => {
      set({ projectId, loaded: false, papers: [] });
      const papers = await listPaperEntries(projectId);
      if (get().projectId === projectId) {
        set({ papers: sortByUpdated(papers), loaded: true });
      }
    },

    addInput: async (projectId, source) => {
      const parsed = extractArxivIdFromInput(source);
      if (!parsed) {
        return null;
      }
      const routeId = routeIdFor(parsed.id, parsed.version);
      const paper = await upsert(projectId, routeId, {
        arxivId: parsed.id,
        version: parsed.version ?? "latest",
        source: source.trim(),
        status: "ready",
        error: undefined,
      });
      replace(paper);
      return routeId;
    },

    recordProcessing: async (projectId, routeId, source) => {
      const parsed = parseArxivId(routeId);
      if (!parsed) {
        return;
      }
      const existing = await getPaperEntry(projectId, routeId);
      const paper = await upsert(projectId, routeId, {
        arxivId: parsed.id,
        version: parsed.version ?? "latest",
        ...(source ? { source } : {}),
        status: existing?.status ?? "ready",
        error: undefined,
      });
      replace(paper);
    },

    recordPaper: async (projectId, routeId, ir, status) => {
      await savePaper(ir);
      const paper = await upsert(projectId, routeId, {
        arxivId: ir.arxivId,
        version: ir.version,
        title: ir.title,
        authors: ir.authors,
        modelUsed: ir.modelUsed,
        status,
        error: undefined,
      });
      replace(paper);
    },

    recordError: async (projectId, routeId, message) => {
      const parsed = parseArxivId(routeId);
      const paper = await upsert(projectId, routeId, {
        arxivId: parsed?.id ?? routeId,
        version: parsed?.version ?? "latest",
        status: "error",
        error: message,
      });
      replace(paper);
    },

    remove: async (projectId, routeId) => {
      await deletePaperEntry(projectId, routeId);
      set((state) => ({
        papers: state.papers.filter((item) => item.routeId !== routeId),
      }));
    },
  };
});
