import {
  AgentSessionSchema,
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
    const row: AgentSession = {
      ...session,
      createdAt: existing?.createdAt ?? session.createdAt ?? now,
      updatedAt: now,
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
