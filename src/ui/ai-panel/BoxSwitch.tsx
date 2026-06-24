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
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="h-7 w-7"
      aria-hidden
    >
      <path
        d="M7 15 L16 20 L16 27 L7 22 Z"
        fill="#f3ead6"
        stroke="#4a3728"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M16 20 L25 15 L25 22 L16 27 Z"
        fill="#e8dcc4"
        stroke="#4a3728"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {open ? (
        <path
          d="M7 15 L16 20 L25 15 L16 10 Z"
          fill="#f3ead6"
          stroke="#4a3728"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      ) : null}
      <g
        className="transition-transform duration-500 ease-[cubic-bezier(0.34,1.2,0.64,1)]"
        style={{
          transformOrigin: "16px 15px",
          transform: open
            ? "translate(5px, 3px) rotate(28deg)"
            : "translate(0, 0) rotate(0deg)",
        }}
      >
        <path
          d="M7 11 L16 15 L25 11 L16 7 Z"
          fill="#8b6914"
          stroke="#4a3728"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d="M16 7 L25 11 L16 15"
          fill="#6b4f2a"
          stroke="#4a3728"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
