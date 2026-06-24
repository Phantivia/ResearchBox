import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchSessions, type AgentSession } from "@/core/agent/session";
import { listAgentSessions } from "@/db";
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

export function HistorySearch({ projectId }: HistorySearchProps) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const sessionsVersion = useAgentStore((state) => state.sessionsVersion);
  const currentSessionId = useAgentStore((state) => state.currentSessionId);
  const loadSession = useAgentStore((state) => state.loadSession);

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
      loadSession(session);
      navigate(`/p/${encodeURIComponent(projectId)}/chat-box`);
    },
    [loadSession, navigate, projectId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col px-2.5 pb-2 pt-1">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-1 py-2 text-xs text-gray-500">{t("agent.history.loading")}</p>
        ) : filteredSessions.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-500">
            {query.trim() ? t("agent.history.noResults") : t("agent.history.empty")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filteredSessions.map((session) => {
              const isActive = session.id != null && session.id === currentSessionId;
              return (
                <li key={session.id ?? `${session.updatedAt}-${session.title}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(session)}
                    className={[
                      "flex w-full flex-col rounded-sm px-2 py-1.5 text-left transition-colors",
                      isActive
                        ? "bg-white/5 text-white"
                        : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200",
                    ].join(" ")}
                  >
                    <span className="truncate text-sm">{session.title}</span>
                    <span className="truncate text-[10px] text-gray-500">
                      {formatSessionDate(session.updatedAt, locale)}
                    </span>
                  </button>
                </li>
              );
            })}
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
