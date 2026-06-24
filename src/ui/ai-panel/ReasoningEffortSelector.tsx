import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_REASONING_EFFORT,
  type ReasoningEffort,
} from "@/core/llm";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/store";

const REASONING_EFFORT_VALUES = ["high", "medium", "low", "off"] as const satisfies readonly ReasoningEffort[];

export function ReasoningEffortSelector() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const getActiveProvider = useSettingsStore((state) => state.getActiveProvider);
  const saveProvider = useSettingsStore((state) => state.saveProvider);

  const provider = getActiveProvider();
  const effort = provider?.reasoningEffort ?? DEFAULT_REASONING_EFFORT;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(buttonRef.current);
  }, [refs]);

  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const role = useRole(context, { role: "menu" });
  const { getFloatingProps, getItemProps } = useInteractions([dismiss, role]);

  const handleSelect = (value: ReasoningEffort) => {
    if (!provider) {
      return;
    }
    setOpen(false);
    void saveProvider({ ...provider, reasoningEffort: value });
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        className="shrink-0 text-xs text-[var(--rb-text-secondary)]"
        title={t("agent.reasoningEffortHint")}
      >
        {t("agent.reasoningEffortLabel")}
      </span>
      <button
        ref={buttonRef}
        type="button"
        disabled={!provider}
        aria-label={t("agent.reasoningEffortLabel")}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t("agent.reasoningEffortHint")}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-[var(--rb-text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--rb-text-primary)_6%,transparent)] hover:text-[var(--rb-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--rb-primary)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="max-w-[5.5rem] truncate sm:max-w-none">{t(`reasoning.${effort}`)}</span>
        <ChevronIcon />
      </button>

      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 min-w-[7rem] overflow-hidden rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] py-1 shadow-lg"
          >
            {REASONING_EFFORT_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={value === effort}
                {...getItemProps({
                  onClick: () => handleSelect(value),
                })}
                className={[
                  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs",
                  value === effort
                    ? "bg-[color-mix(in_srgb,var(--rb-primary)_12%,transparent)] text-[var(--rb-text-primary)]"
                    : "text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-text-primary)_6%,transparent)] hover:text-[var(--rb-text-primary)]",
                ].join(" ")}
              >
                {t(`reasoning.${value}`)}
                {value === effort ? <CheckIcon /> : null}
              </button>
            ))}
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3 w-3 shrink-0 opacity-60" aria-hidden>
      <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3 w-3 shrink-0" aria-hidden>
      <path d="M2.5 6 5 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
