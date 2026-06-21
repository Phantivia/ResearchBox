import { registerSW } from "virtual:pwa-register";
import { usePwaStore } from "./store";

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function registerPwa(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const { setUpdateAvailable } = usePwaStore.getState();

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      setUpdateAvailable(true);
    },
    onOfflineReady() {
      // App shell is cached; no UI needed here.
    },
  });
}

export async function applyPwaUpdate(): Promise<void> {
  if (!updateServiceWorker) {
    window.location.reload();
    return;
  }

  await updateServiceWorker(true);
}

export function bindOfflineListeners(): () => void {
  const { setOffline } = usePwaStore.getState();
  setOffline(!navigator.onLine);

  const handleOnline = () => setOffline(false);
  const handleOffline = () => setOffline(true);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

export function bindInstallPromptListener(): () => void {
  const handler = (event: Event) => {
    event.preventDefault();
    usePwaStore.getState().setInstallPrompt(event as import("./store").BeforeInstallPromptEvent);
  };

  window.addEventListener("beforeinstallprompt", handler);
  return () => window.removeEventListener("beforeinstallprompt", handler);
}

export function initPwa(): () => void {
  registerPwa();
  const unbindOffline = bindOfflineListeners();
  const unbindInstall = bindInstallPromptListener();

  return () => {
    unbindOffline();
    unbindInstall();
  };
}
