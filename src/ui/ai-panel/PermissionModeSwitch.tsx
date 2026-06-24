import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

const MODES = ["default", "plan", "autoApproveRead"] as const;

type PermissionMode = (typeof MODES)[number];

const MODE_I18N = {
  default: {
    label: "agent.permission.default",
    desc: "agent.permission.defaultDesc",
  },
  plan: {
    label: "agent.permission.plan",
    desc: "agent.permission.planDesc",
  },
  autoApproveRead: {
    label: "agent.permission.autoApproveRead",
    desc: "agent.permission.autoApproveReadDesc",
  },
} as const satisfies Record<
  PermissionMode,
  { label: string; desc: string }
>;

export interface PermissionModeSwitchProps {
  className?: string;
}

export function PermissionModeSwitch({ className = "" }: PermissionModeSwitchProps) {
  const { t } = useTranslation();
  const permissionMode = useAgentStore((state) => state.permissionMode);
  const setPermissionMode = useAgentStore((state) => state.setPermissionMode);

  const activeDesc = t(MODE_I18N[permissionMode].desc);

  return (
    <div className={`px-4 py-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-[var(--rb-text-secondary)]">
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
                onClick={() => setPermissionMode(mode)}
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
      <p className="mt-1 text-xs text-[var(--rb-text-secondary)]">{activeDesc}</p>
    </div>
  );
}
