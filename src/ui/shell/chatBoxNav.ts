import type { MessageKey } from "@/core/i18n";
import type { FeatureIconId } from "./featureIcons";

export interface ChatBoxNavItem {
  id: string;
  labelKey: MessageKey;
  icon: FeatureIconId;
  requiresProject: boolean;
  path: (projectId: string) => string;
  isActive: (pathname: string) => boolean;
}

export const CHATBOX_NAV: readonly ChatBoxNavItem[] = [
  {
    id: "chat-box-artifacts",
    labelKey: "nav.chatBoxArtifacts",
    icon: "chat-box-artifacts",
    requiresProject: true,
    path: (projectId) => `/p/${encodeURIComponent(projectId)}/chat-box/artifacts`,
    isActive: (pathname) => /\/chat-box\/artifacts(?:\/|$)/.test(pathname),
  },
  {
    id: "chat-box-new",
    labelKey: "nav.chatBoxNewChat",
    icon: "chat-box-new",
    requiresProject: true,
    path: (projectId) => `/p/${encodeURIComponent(projectId)}/chat-box`,
    isActive: (pathname) =>
      /\/chat-box(?:\/|$)/.test(pathname) && !/\/artifacts(?:\/|$)/.test(pathname),
  },
];

export function isChatBoxRoute(pathname: string): boolean {
  return /\/chat-box(?:\/|$)/.test(pathname);
}
