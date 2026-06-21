import { create } from "zustand";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaState = {
  offline: boolean;
  updateAvailable: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  setOffline: (offline: boolean) => void;
  setUpdateAvailable: (available: boolean) => void;
  setInstallPrompt: (event: BeforeInstallPromptEvent | null) => void;
  clearInstallPrompt: () => void;
};

export const usePwaStore = create<PwaState>((set) => ({
  offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
  updateAvailable: false,
  installPrompt: null,
  setOffline: (offline) => set({ offline }),
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
  setInstallPrompt: (installPrompt) => set({ installPrompt }),
  clearInstallPrompt: () => set({ installPrompt: null }),
}));

export type { BeforeInstallPromptEvent };
