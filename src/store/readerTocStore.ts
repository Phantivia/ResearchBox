import { create } from "zustand";
import type { TocEntry } from "@/core/toc";
import {
  clampAnnotationPanelWidth,
  persistAnnotationPanelWidth,
  readStoredAnnotationPanelWidth,
} from "@/store/readerPanelWidth";

interface ReaderTocState {
  entries: TocEntry[];
  activeId: string | null;
  mobileOpen: boolean;
  annotationPanelWidth: number;
}

interface ReaderTocActions {
  setEntries: (entries: TocEntry[]) => void;
  setActiveId: (id: string | null) => void;
  setMobileOpen: (open: boolean) => void;
  setAnnotationPanelWidth: (width: number) => void;
  reset: () => void;
}

const initialState: ReaderTocState = {
  entries: [],
  activeId: null,
  mobileOpen: false,
  annotationPanelWidth: readStoredAnnotationPanelWidth(),
};

/**
 * 阅读器目录的跨组件状态。Reader 页负责写入 entries / activeId；
 * 移动端顶栏（位于 Sidebar）据此显示当前 section 并开关右侧目录面板。
 */
export const useReaderTocStore = create<ReaderTocState & ReaderTocActions>()(
  (set) => ({
    ...initialState,

    setEntries: (entries) =>
      set((state) => ({
        entries,
        activeId:
          state.activeId && entries.some((entry) => entry.id === state.activeId)
            ? state.activeId
            : (entries[0]?.id ?? null),
      })),

    setActiveId: (id) => set({ activeId: id }),

    setMobileOpen: (open) => set({ mobileOpen: open }),

    setAnnotationPanelWidth: (width) => {
      const clamped = clampAnnotationPanelWidth(width);
      persistAnnotationPanelWidth(clamped);
      set({ annotationPanelWidth: clamped });
    },

    reset: () =>
      set({
        ...initialState,
        annotationPanelWidth: readStoredAnnotationPanelWidth(),
      }),
  }),
);
