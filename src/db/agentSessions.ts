import {
  AgentSessionSchema,
  agentMessagesEqual,
  type AgentSession,
} from "@/core/agent/session";
import { db } from "./index";

function parseAgentSession(row: unknown): AgentSession {
  return AgentSessionSchema.parse(row);
}

export async function saveAgentSession(session: AgentSession): Promise<number> {
  const now = Date.now();

  if (session.id != null) {
    const existing = await db.agentSessions.get(session.id);
    const existingRow = existing ? parseAgentSession(existing) : undefined;
    const messagesChanged =
      existingRow == null || !agentMessagesEqual(existingRow.messages, session.messages);
    const row: AgentSession = {
      ...session,
      createdAt: existingRow?.createdAt ?? session.createdAt ?? now,
      updatedAt: messagesChanged ? now : (existingRow?.updatedAt ?? now),
      pinnedAt: session.pinnedAt ?? existingRow?.pinnedAt,
    };
    await db.agentSessions.put(row);
    return session.id;
  }

  const row: AgentSession = {
    ...session,
    createdAt: session.createdAt ?? now,
    updatedAt: now,
  };
  const id = await db.agentSessions.add(row);
  if (id === undefined) {
    throw new Error("Failed to persist agent session");
  }
  return id;
}

export async function getAgentSession(id: number): Promise<AgentSession | undefined> {
  const row = await db.agentSessions.get(id);
  if (!row) {
    return undefined;
  }
  return parseAgentSession(row);
}

export async function listAgentSessions(projectId: string): Promise<AgentSession[]> {
  const rows = await db.agentSessions.where("projectId").equals(projectId).sortBy("updatedAt");
  return rows.reverse().map((row) => parseAgentSession(row));
}

export async function deleteAgentSession(id: number): Promise<void> {
  await db.agentSessions.delete(id);
}

export async function updateAgentSessionTitle(id: number, title: string): Promise<void> {
  const existing = await db.agentSessions.get(id);
  if (!existing) {
    return;
  }

  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }

  const row = parseAgentSession(existing);
  await db.agentSessions.put({
    ...row,
    title: trimmed,
    updatedAt: Date.now(),
  });
}

export async function setAgentSessionPinned(id: number, pinned: boolean): Promise<void> {
  const existing = await db.agentSessions.get(id);
  if (!existing) {
    return;
  }

  const row = parseAgentSession(existing);
  await db.agentSessions.put({
    ...row,
    pinnedAt: pinned ? Date.now() : undefined,
    updatedAt: Date.now(),
  });
}
