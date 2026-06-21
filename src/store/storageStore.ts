import { create } from "zustand";
import {
  estimateStorage,
  isNearQuota,
  isStoragePersisted,
  requestPersistentStorage,
  type StorageEstimate,
} from "@/core/storage";

interface StorageState {
  persisted: boolean;
  estimate: StorageEstimate | null;
  loaded: boolean;
  initialized: boolean;
}

interface StorageActions {
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  isNearQuota: () => boolean;
}

export const useStorageStore = create<StorageState & StorageActions>(
  (set, get) => ({
    persisted: false,
    estimate: null,
    loaded: false,
    initialized: false,

    init: async () => {
      if (get().initialized) {
        return;
      }
      set({ initialized: true });
      // 申请持久化以降低被浏览器自动清除的风险；已授予时 persist() 直接返回 true。
      const granted = await requestPersistentStorage();
      const persisted = granted || (await isStoragePersisted());
      const estimate = await estimateStorage();
      set({ persisted, estimate, loaded: true });
    },

    refresh: async () => {
      const [persisted, estimate] = await Promise.all([
        isStoragePersisted(),
        estimateStorage(),
      ]);
      set({ persisted, estimate, loaded: true });
    },

    isNearQuota: () => isNearQuota(get().estimate),
  }),
);
