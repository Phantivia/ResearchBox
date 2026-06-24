import type { MessageKey } from "@/core/i18n";
import type { FeatureIconId } from "./featureIcons";

export interface FeatureNavItem {
  id: string;
  labelKey: MessageKey;
  icon: FeatureIconId;
  requiresProject: boolean;
  path: (projectId: string) => string;
  isActive: (pathname: string) => boolean;
}

export const FEATURE_NAV: readonly FeatureNavItem[] = [
  {
    id: "agent-chat",
    labelKey: "nav.agentChat",
    icon: "agent-chat",
    requiresProject: true,
    path: (projectId) => `/p/${encodeURIComponent(projectId)}/agent`,
    isActive: (pathname) => /\/agent(?:\/|$)/.test(pathname),
  },
  {
    id: "paper-box",
    labelKey: "nav.paperBox",
    icon: "paper-box",
    requiresProject: true,
    path: (projectId) => `/p/${encodeURIComponent(projectId)}/paper-box`,
    isActive: (pathname) => /\/paper-box(?:\/|$)/.test(pathname),
  },
  {
    id: "dummy",
    labelKey: "nav.dummy",
    icon: "dummy",
    requiresProject: true,
    path: (projectId) => `/p/${encodeURIComponent(projectId)}/dummy`,
    isActive: (pathname) => /\/dummy(?:\/|$)/.test(pathname),
  },
];
