import { applyPwaUpdate } from "./register";
import { usePwaStore } from "./store";
import { useTranslation } from "@/i18n";

export function UpdatePrompt() {
  const updateAvailable = usePwaStore((state) => state.updateAvailable);
  const setUpdateAvailable = usePwaStore((state) => state.setUpdateAvailable);
  const { t } = useTranslation();

  if (!updateAvailable) {
    return null;
  }

  const handleRefresh = () => {
    void applyPwaUpdate().finally(() => {
      setUpdateAvailable(false);
    });
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-3 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <p className="flex-1 text-sm text-gray-800">{t("pwa.updateAvailable")}</p>
      <button
        type="button"
        onClick={handleRefresh}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        {t("pwa.refresh")}
      </button>
    </div>
  );
}
