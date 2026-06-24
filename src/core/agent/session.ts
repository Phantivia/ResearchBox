import { z } from "zod";
import { AgentMessageSchema, type AgentMessage } from "@/core/agent/types";

export const AgentSessionSchema = z.object({
  id: z.number().optional(),
  projectId: z.string(),
  title: z.string(),
  messages: z.array(AgentMessageSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  pinnedAt: z.number().optional(),
});

export type AgentSession = z.infer<typeof AgentSessionSchema>;

const DEFAULT_TITLE = "New conversation";

export function agentMessagesEqual(a: AgentMessage[], b: AgentMessage[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function extractSearchableText(messages: AgentMessage[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === "text" || block.type === "thinking") {
        parts.push(block.text);
      }
    }
  }
  return parts.join("\n");
}

export function deriveSessionTitle(messages: AgentMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    for (const block of message.content) {
      if (block.type === "text") {
        const trimmed = block.text.trim();
        if (trimmed.length > 0) {
          return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
        }
      }
    }
  }
  return DEFAULT_TITLE;
}

export function compareAgentSessions(a: AgentSession, b: AgentSession): number {
  const aPinned = a.pinnedAt != null && a.pinnedAt > 0;
  const bPinned = b.pinnedAt != null && b.pinnedAt > 0;

  if (aPinned !== bPinned) {
    return aPinned ? -1 : 1;
  }

  if (aPinned && bPinned) {
    return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
  }

  return b.updatedAt - a.updatedAt;
}

export function searchSessions(sessions: AgentSession[], query: string): AgentSession[] {
  const normalized = query.trim().toLowerCase();
  const filtered =
    normalized.length === 0
      ? sessions
      : sessions.filter((session) => {
          if (session.title.toLowerCase().includes(normalized)) {
            return true;
          }
          return extractSearchableText(session.messages).toLowerCase().includes(normalized);
        });

  return [...filtered].sort(compareAgentSessions);
}
