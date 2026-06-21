import { useState, type MouseEvent, type ReactNode } from "react";
import { ImageViewer } from "./ImageViewer";
import { OverflowContainer } from "./OverflowContainer";

interface ActiveImage {
  src: string;
  alt: string;
}

function resolveImageFromClick(target: EventTarget | null): ActiveImage | null {
  if (!(target instanceof Element)) return null;
  const image = target.closest("img");
  if (!(image instanceof HTMLImageElement)) return null;

  const src = image.currentSrc || image.src;
  if (!src) return null;

  return { src, alt: image.alt };
}

export function FigureBlock({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveImage | null>(null);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const image = resolveImageFromClick(event.target);
    if (!image) return;
    event.preventDefault();
    setActive(image);
  };

  return (
    <div className="rb-figure" onClick={handleClick}>
      <OverflowContainer>{children}</OverflowContainer>
      {active && (
        <ImageViewer src={active.src} alt={active.alt} onClose={() => setActive(null)} />
      )}
    </div>
  );
}
