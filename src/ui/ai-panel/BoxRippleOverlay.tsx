import { useEffect, type CSSProperties } from "react";
import type { BoxRippleOrigin } from "@/store/agentStore";

export interface BoxRippleOverlayProps {
  origin: BoxRippleOrigin;
  onComplete: () => void;
}

const RIPPLE_DURATION_MS = 1100;

export function BoxRippleOverlay({ origin, onComplete }: BoxRippleOverlayProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, RIPPLE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={[
        "rb-box-ripple-overlay pointer-events-none absolute inset-0 z-0",
        origin.mode === "opening" ? "rb-box-ripple-overlay--opening" : "rb-box-ripple-overlay--closing",
      ].join(" ")}
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
