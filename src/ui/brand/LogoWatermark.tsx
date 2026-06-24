import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/store";
import { Logo } from "./Logo";

const LOGO_REVEAL_MS = 900;

export function LogoWatermark() {
  const logoRevealGeneration = useAgentStore((state) => state.logoRevealGeneration);
  const prevGenerationRef = useRef(logoRevealGeneration);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (logoRevealGeneration <= prevGenerationRef.current) {
      return;
    }

    prevGenerationRef.current = logoRevealGeneration;
    setRevealing(true);
    const timer = window.setTimeout(() => setRevealing(false), LOGO_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [logoRevealGeneration]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="rb-logo-anchor">
        <div className={["rb-logo-emboss", revealing ? "rb-logo-emboss--revealing" : ""].join(" ")}>
          <Logo className="h-full w-full text-[var(--rb-text-primary)]" />
        </div>
      </div>
    </div>
  );
}
