import { usePwaStore } from "./store";
import { useTranslation } from "@/i18n";

export function OfflineBanner() {
  const offline = usePwaStore((state) => state.offline);
  const { t } = useTranslation();

  if (!offline) {
    return null;
  }

  return (
    <div
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
      role="status"
      aria-live="polite"
    >
      {t("pwa.offlineBanner")}
    </div>
  );
}
