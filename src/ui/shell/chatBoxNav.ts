import type { MessageKey } from "@/core/i18n";
import type { FeatureIconId } from "./featureIcons";

export interface ChatBoxNavItem {
  id: string;
  labelKey: MessageKey;
  icon: FeatureIconId;
  requiresProject: boolean;
  path: (projectId: string) => string;
  isActive: (pathname: string, currentSessionId: number | null) => boolean;
}

export const CHATBOX_NAV: readonly ChatBoxNavItem[] = [
  {
    id: "chat-box-new",
    labelKey: "nav.chatBoxNewChat",
    icon: "chat-box-new",
    requiresProject: true,
    path: (projectId) => `/p/${encodeURIComponent(projectId)}/chat-box`,
    isActive: (pathname, currentSessionId) =>
      /\/chat-box(?:\/|$)/.test(pathname) &&
      !/\/chat-box\/artifacts(?:\/|$)/.test(pathname) &&
      currentSessionId === null,
  },
];

export function isChatBoxRoute(pathname: string): boolean {
  return (
    /\/chat-box(?:\/|$)/.test(pathname) &&
    !/\/chat-box\/artifacts(?:\/|$)/.test(pathname)
  );
}
