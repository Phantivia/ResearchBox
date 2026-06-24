import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchSessions, type AgentSession } from "@/core/agent/session";
import {
  deleteAgentSession,
  listAgentSessions,
  setAgentSessionPinned,
  updateAgentSessionTitle,
} from "@/db";
import { useTranslation } from "@/i18n";
import { useAgentStore } from "@/store";

export interface HistorySearchProps {
  projectId: string;
}

function formatSessionDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SessionHistoryItemProps {
  session: AgentSession;
  isActive: boolean;
  locale: string;
  menuOpen: boolean;
  editing: boolean;
  isRunning: boolean;
  onSelect: (session: AgentSession) => void;
  onToggleMenu: (sessionId: number | null) => void;
  onStartRename: (session: AgentSession) => void;
  onRename: (sessionId: number, title: string) => void;
  onCancelRename: () => void;
  onTogglePin: (session: AgentSession) => void;
  onDelete: (session: AgentSession) => void;
}

function SessionHistoryItem({
  session,
  isActive,
  locale,
  menuOpen,
  editing,
  isRunning,
  onSelect,
  onToggleMenu,
  onStartRename,
  onRename,
  onCancelRename,
  onTogglePin,
  onDelete,
}: SessionHistoryItemProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const sessionId = session.id;
  const isPinned = session.pinnedAt != null && session.pinnedAt > 0;

  useEffect(() => {
    if (editing) {
      setDraftTitle(session.title);
    }
  }, [editing, session.title]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        onToggleMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen, onToggleMenu]);

  function commitRename() {
    if (sessionId == null) {
      onCancelRename();
      return;
    }

    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(sessionId, trimmed);
    } else {
      onCancelRename();
    }
  }

  if (sessionId == null) {
    return null;
  }

  return (
    <li className="relative">
      <div
        className={[
          "group flex min-w-0 items-stretch rounded-sm transition-colors",
          editing
            ? ""
            : isActive
              ? "bg-white/5"
              : "hover:bg-white/[0.04]",
        ].join(" ")}
      >
        {editing ? (
          <input
            type="text"
            value={draftTitle}
            autoFocus
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitRename();
              } else if (event.key === "Escape") {
                setDraftTitle(session.title);
                onCancelRename();
              }
            }}
            className="min-w-0 flex-1 rounded-sm border border-white/20 bg-white/[0.06] px-2 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelect(session)}
            className={[
              "flex min-w-0 flex-1 flex-col px-2 py-1.5 text-left transition-colors",
              isActive ? "text-white" : "text-gray-400 group-hover:text-gray-200",
            ].join(" ")}
          >
            <span className="flex min-w-0 items-center gap-1 truncate text-sm">
              {isPinned ? (
                <PinIcon className="h-3 w-3 shrink-0 text-amber-400/90" />
              ) : null}
              <span className="truncate">{session.title}</span>
            </span>
            <span className="truncate text-[10px] text-gray-500">
              {formatSessionDate(session.updatedAt, locale)}
            </span>
          </button>
        )}

        {!editing ? (
          <div ref={menuRef} className="relative flex shrink-0 items-center pr-0.5">
            {isRunning ? (
              <span
                className="flex h-7 w-7 items-center justify-center"
                aria-label={t("agent.history.running")}
              >
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-gray-300" />
              </span>
            ) : (
              <button
                type="button"
                aria-label={t("agent.history.sessionMenu")}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleMenu(menuOpen ? null : sessionId);
                }}
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                  menuOpen
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:bg-white/10 hover:text-gray-300",
                ].join(" ")}
              >
                <MoreIcon className="h-4 w-4" />
              </button>
            )}

            {menuOpen && !isRunning ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-0.5 min-w-[8.5rem] overflow-hidden rounded-sm border border-white/10 bg-[#1a1d24] py-0.5 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onTogglePin(session)}
                  className="flex w-full px-2.5 py-1.5 text-left text-sm text-gray-200 transition-colors hover:bg-white/10"
                >
                  {isPinned ? t("agent.history.unpin") : t("agent.history.pin")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onStartRename(session)}
                  className="flex w-full px-2.5 py-1.5 text-left text-sm text-gray-200 transition-colors hover:bg-white/10"
                >
                  {t("agent.history.rename")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onDelete(session)}
                  className="flex w-full px-2.5 py-1.5 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10"
                >
                  {t("common.delete")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function HistorySearch({ projectId }: HistorySearchProps) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const sessionsVersion = useAgentStore((state) => state.sessionsVersion);
  const currentSessionId = useAgentStore((state) => state.currentSessionId);
  const agentRunning = useAgentStore((state) => state.agentRunning);
  const loadSession = useAgentStore((state) => state.loadSession);
  const startNewSession = useAgentStore((state) => state.startNewSession);
  const bumpSessionsVersion = useAgentStore((state) => state.bumpSessionsVersion);

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void listAgentSessions(projectId).then((rows) => {
      if (!cancelled) {
        setSessions(rows);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, sessionsVersion]);

  const filteredSessions = useMemo(
    () => searchSessions(sessions, query),
    [sessions, query],
  );

  const handleSelect = useCallback(
    (session: AgentSession) => {
      setOpenMenuId(null);
      loadSession(session);
      navigate(`/p/${encodeURIComponent(projectId)}/chat-box`);
    },
    [loadSession, navigate, projectId],
  );

  const handleTogglePin = useCallback(
    (session: AgentSession) => {
      if (session.id == null) {
        return;
      }

      setOpenMenuId(null);
      const pinned = !(session.pinnedAt != null && session.pinnedAt > 0);
      void setAgentSessionPinned(session.id, pinned).then(() => {
        bumpSessionsVersion();
      });
    },
    [bumpSessionsVersion],
  );

  const handleStartRename = useCallback((session: AgentSession) => {
    if (session.id == null) {
      return;
    }

    setOpenMenuId(null);
    setEditingSessionId(session.id);
  }, []);

  const handleRename = useCallback(
    (sessionId: number, title: string) => {
      setEditingSessionId(null);
      void updateAgentSessionTitle(sessionId, title).then(() => {
        bumpSessionsVersion();
      });
    },
    [bumpSessionsVersion],
  );

  const handleDelete = useCallback(
    (session: AgentSession) => {
      if (session.id == null) {
        return;
      }

      setOpenMenuId(null);
      if (
        !window.confirm(t("agent.history.deleteConfirm", { title: session.title }))
      ) {
        return;
      }

      void deleteAgentSession(session.id).then(() => {
        if (session.id === currentSessionId) {
          startNewSession();
        }
        bumpSessionsVersion();
      });
    },
    [bumpSessionsVersion, currentSessionId, startNewSession, t],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2 pt-1">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-1 py-2 text-xs text-gray-500">{t("agent.history.loading")}</p>
        ) : filteredSessions.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-500">
            {query.trim() ? t("agent.history.noResults") : t("agent.history.empty")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filteredSessions.map((session) => (
              <SessionHistoryItem
                key={session.id ?? `${session.updatedAt}-${session.title}`}
                session={session}
                isActive={session.id != null && session.id === currentSessionId}
                isRunning={
                  agentRunning &&
                  session.id != null &&
                  session.id === currentSessionId
                }
                locale={locale}
                menuOpen={session.id != null && session.id === openMenuId}
                editing={session.id != null && session.id === editingSessionId}
                onSelect={handleSelect}
                onToggleMenu={setOpenMenuId}
                onStartRename={handleStartRename}
                onRename={handleRename}
                onCancelRename={() => setEditingSessionId(null)}
                onTogglePin={handleTogglePin}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 pt-2">
        <label className="sr-only" htmlFor="agent-history-search">
          {t("agent.history.searchLabel")}
        </label>
        <input
          id="agent-history-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("agent.history.searchPlaceholder")}
          className="w-full rounded-sm border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-white/20 focus:outline-none"
        />
      </div>
    </div>
  );
}

function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}
