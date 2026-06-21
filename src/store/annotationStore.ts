import { create } from "zustand";
import type { Annotation, TextAnchor } from "@/core/annotation";
import {
  addAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateNote,
} from "@/db";

interface AnnotationState {
  projectId: string | null;
  paperId: string | null;
  annotations: Annotation[];
  loading: boolean;
}

interface AnnotationActions {
  loadForPaper: (projectId: string, paperId: string) => Promise<void>;
  createHighlight: (
    projectId: string,
    paperId: string,
    anchor: TextAnchor,
    note?: string,
  ) => Promise<Annotation | null>;
  removeAnnotation: (id: number) => Promise<void>;
  editNote: (id: number, note: string) => Promise<void>;
  reset: () => void;
}

const initialState: AnnotationState = {
  projectId: null,
  paperId: null,
  annotations: [],
  loading: false,
};

export const useAnnotationStore = create<AnnotationState & AnnotationActions>()(
  (set) => ({
    ...initialState,

    loadForPaper: async (projectId, paperId) => {
      set({ loading: true, projectId, paperId });
      const annotations = await listAnnotations(projectId, paperId);
      set({ annotations, loading: false });
    },

    createHighlight: async (projectId, paperId, anchor, note) => {
      const created = await addAnnotation({
        projectId,
        paperId,
        blockId: anchor.blockId,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
        quote: anchor.quote,
        note,
        color: "yellow",
      });
      set((state) => ({
        projectId,
        paperId,
        annotations: [...state.annotations, created],
      }));
      return created;
    },

    removeAnnotation: async (id) => {
      await deleteAnnotation(id);
      set((state) => ({
        annotations: state.annotations.filter((item) => item.id !== id),
      }));
    },

    editNote: async (id, note) => {
      const updated = await updateNote(id, note);
      if (!updated) {
        return;
      }
      set((state) => ({
        annotations: state.annotations.map((item) =>
          item.id === id ? updated : item,
        ),
      }));
    },

    reset: () => {
      set(initialState);
    },
  }),
);
