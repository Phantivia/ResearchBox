import { useEffect, useCallback } from "react";
import { useTranslation } from "@/i18n";

export interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "", onClose }: ImageLightboxProps) {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("reader.imageLightbox.label")}
      data-testid="image-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white hover:bg-black/70"
      >
        {t("common.close")}
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export interface ActiveImage {
  src: string;
  alt: string;
}

export function resolveFigureImageFromClick(target: EventTarget | null): ActiveImage | null {
  if (!(target instanceof HTMLImageElement)) {
    return null;
  }
  if (!target.closest("figure")) {
    return null;
  }
  return {
    src: target.currentSrc || target.src,
    alt: target.alt,
  };
}
