import type { MouseEvent, RefObject } from "react";
import type { BoxRippleOrigin } from "@/store/agentStore";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

export interface BoxSwitchProps {
  rippleContainerRef?: RefObject<HTMLElement | null>;
}

function rippleOriginFromClick(
  event: MouseEvent<HTMLButtonElement>,
  container: HTMLElement,
  mode: BoxRippleOrigin["mode"],
): BoxRippleOrigin | null {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    xPercent: ((event.clientX - rect.left) / rect.width) * 100,
    yPercent: ((event.clientY - rect.top) / rect.height) * 100,
    mode,
  };
}

export function BoxSwitch({ rippleContainerRef }: BoxSwitchProps) {
  const { t } = useTranslation();
  const boxOpen = useAgentStore((state) => state.boxOpen);
  const openBox = useAgentStore((state) => state.openBox);
  const closeBox = useAgentStore((state) => state.closeBox);
  const setBoxRippleOrigin = useAgentStore((state) => state.setBoxRippleOrigin);

  const label = boxOpen ? t("agent.box.collecting") : t("agent.box.researching");

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const container = rippleContainerRef?.current;
    if (container) {
      const origin = rippleOriginFromClick(
        event,
        container,
        boxOpen ? "closing" : "opening",
      );
      if (origin) {
        setBoxRippleOrigin(origin);
      }
    }

    if (boxOpen) {
      closeBox();
      return;
    }
    openBox();
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={boxOpen}
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={[
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_45%,transparent)]",
        boxOpen
          ? "border-[var(--rb-border)] bg-[var(--rb-page-bg)] text-[var(--rb-text-primary)] hover:bg-[color-mix(in_srgb,var(--rb-text-primary)_6%,var(--rb-page-bg))]"
          : "border-[var(--rb-primary-hover)] bg-[var(--rb-primary-hover)] text-white hover:bg-[var(--rb-primary)]",
      ].join(" ")}
    >
      <span
        className={[
          "transition-transform duration-300",
          boxOpen ? "scale-100 rotate-0" : "scale-95 rotate-12",
        ].join(" ")}
      >
        {boxOpen ? <OpenBoxIcon /> : <ClosedBoxIcon />}
      </span>
    </button>
  );
}

function OpenBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.3 7 12 12l8.7-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 22V12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClosedBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
      <rect x="3" y="11" width="18" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
