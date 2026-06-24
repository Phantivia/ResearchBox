import { useEffect, type CSSProperties } from "react";

export interface BoxRippleOrigin {
  xPercent: number;
  yPercent: number;
}

export interface BoxRippleOverlayProps {
  origin: BoxRippleOrigin;
  onComplete: () => void;
}

const RIPPLE_DURATION_MS = 850;

export function BoxRippleOverlay({ origin, onComplete }: BoxRippleOverlayProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, RIPPLE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="rb-box-ripple-overlay pointer-events-none absolute inset-0 z-10"
      style={
        {
          "--ripple-x": `${origin.xPercent}%`,
          "--ripple-y": `${origin.yPercent}%`,
        } as CSSProperties
      }
      aria-hidden
    />
  );
}
