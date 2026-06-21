import { usePwaStore } from "./store";
import { useTranslation } from "@/i18n";

type InstallButtonProps = {
  compact?: boolean;
  variant?: "sidebar" | "settings";
};

export function InstallButton({ compact = false, variant = "sidebar" }: InstallButtonProps) {
  const installPrompt = usePwaStore((state) => state.installPrompt);
  const clearInstallPrompt = usePwaStore((state) => state.clearInstallPrompt);
  const { t } = useTranslation();

  if (!installPrompt) {
    return null;
  }

  const handleInstall = async () => {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    clearInstallPrompt();
  };

  if (variant === "settings") {
    return (
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">
          {t("nav.installApp")}
        </span>
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <DownloadIcon />
          {t("nav.installApp")}
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void handleInstall()}
        title={t("nav.installApp")}
        aria-label={t("nav.installApp")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white"
      >
        <DownloadIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleInstall()}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <DownloadIcon />
      </span>
      <span className="truncate">{t("nav.installApp")}</span>
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
