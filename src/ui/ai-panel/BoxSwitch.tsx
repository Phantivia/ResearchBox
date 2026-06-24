import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

export function BoxSwitch() {
  const { t } = useTranslation();
  const boxOpen = useAgentStore((state) => state.boxOpen);
  const openBox = useAgentStore((state) => state.openBox);
  const closeBox = useAgentStore((state) => state.closeBox);

  const label = boxOpen ? t("agent.box.collecting") : t("agent.box.researching");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={boxOpen}
      aria-label={label}
      title={label}
      onClick={() => {
        if (boxOpen) {
          closeBox();
        } else {
          openBox();
        }
      }}
      className={[
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--rb-primary)]",
        boxOpen
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
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
