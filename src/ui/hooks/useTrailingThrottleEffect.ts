import { useEffect, useRef } from "react";

export function useTrailingThrottleEffect(
  effect: () => void,
  deps: readonly unknown[],
  delayMs: number,
): void {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      effectRef.current();
    }, delayMs);
    return () => window.clearTimeout(timer);
    // deps are forwarded explicitly by callers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs]);
}
