import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

export function BoxSwitch() {
  const { t } = useTranslation();
  const boxOpen = useAgentStore((state) => state.boxOpen);
  const openBox = useAgentStore((state) => state.openBox);
  const closeBox = useAgentStore((state) => state.closeBox);

  const label = boxOpen ? t("agent.box.collecting") : t("agent.box.researching");

  const handleClick = () => {
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
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--rb-text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--rb-text-primary)_6%,transparent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_45%,transparent)]"
    >
      <BoxIcon open={boxOpen} />
    </button>
  );
}

function BoxIcon({ open }: { open: boolean }) {
  const sw = 1.45;
  const cap = "round" as const;
  const join = "round" as const;

  const boxTop = "M16 8 L7 13 L16 18 L25 13 Z";
  const leftFace = "M7 13 L7 24 L16 29 L16 18 Z";
  const rightFace = "M16 18 L25 13 L25 24 L16 29 Z";

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      className="h-7 w-7"
      aria-hidden
    >
      <path d={leftFace} strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join} />
      <path d={rightFace} strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join} />
      <path
        d={boxTop}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <g
        className="transition-transform duration-500 ease-[cubic-bezier(0.34,1.2,0.64,1)]"
        style={{
          transformOrigin: "16px 13px",
          transform: open
            ? "translate(5px, 4px) rotate(26deg)"
            : "translate(0, 0) rotate(0deg)",
        }}
      >
        <path
          d={boxTop}
          className="fill-[var(--rb-page-bg)]"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap={cap}
          strokeLinejoin={join}
        />
      </g>
    </svg>
  );
}
