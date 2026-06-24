import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/store";
import type { PermissionMode } from "@/core/agent/types";
import { SETTINGS_SECTION_IDS } from "./sections";

const MODES = ["default", "ask"] as const satisfies readonly PermissionMode[];

const MODE_I18N = {
  default: {
    label: "agent.permission.default",
    desc: "agent.permission.defaultDesc",
  },
  ask: {
    label: "agent.permission.ask",
    desc: "agent.permission.askDesc",
  },
} as const satisfies Record<
  PermissionMode,
  { label: string; desc: string }
>;

export function ChatBoxSection() {
  const { t } = useTranslation();
  const permissionMode = useSettingsStore((state) => state.permissionMode);
  const setPermissionMode = useSettingsStore((state) => state.setPermissionMode);

  const activeDesc = t(MODE_I18N[permissionMode].desc);

  return (
    <section
      id={SETTINGS_SECTION_IDS.chatBox}
      className="scroll-mt-4 mb-8 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] p-6 shadow-sm"
    >
      <h2 className="mb-4 text-lg font-semibold text-[var(--rb-text-primary)]">
        {t("settings.chatBox")}
      </h2>
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-[var(--rb-text-secondary)]">
            {t("agent.permission.label")}
          </span>
          <div
            className="inline-flex rounded-sm border border-[var(--rb-border)] p-0.5"
            role="radiogroup"
            aria-label={t("agent.permission.label")}
          >
            {MODES.map((mode) => {
              const active = permissionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => void setPermissionMode(mode)}
                  className={[
                    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--rb-primary)]",
                    active
                      ? "bg-[var(--rb-primary)] text-white"
                      : "text-[var(--rb-text-secondary)] hover:bg-[color-mix(in_srgb,var(--rb-border)_40%,var(--rb-page-bg))] hover:text-[var(--rb-text-primary)]",
                  ].join(" ")}
                >
                  {t(MODE_I18N[mode].label)}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--rb-text-secondary)]">{activeDesc}</p>
      </div>
    </section>
  );
}
