import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import type { AgentMessage } from "@/core/agent/types";
import type { AgentSession } from "@/core/agent/session";
import {
  db,
  saveAgentSession,
  getAgentSession,
  listAgentSessions,
  deleteAgentSession,
  updateAgentSessionTitle,
  setAgentSessionPinned,
} from "./index";

function userMessage(text: string): AgentMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const now = Date.now();
  return {
    projectId: "proj-1",
    title: "Test session",
    messages: [userMessage("hello")],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.agentSessions.clear();
});

describe("saveAgentSession / getAgentSession", () => {
  it("persists and retrieves a session by id", async () => {
    const id = await saveAgentSession(makeSession());
    const stored = await getAgentSession(id);

    expect(stored).toMatchObject({
      id,
      projectId: "proj-1",
      title: "Test session",
    });
    expect(stored?.messages).toEqual([userMessage("hello")]);
  });

  it("upserts on the same id and preserves createdAt", async () => {
    const createdAt = 1_000;
    const id = await saveAgentSession(makeSession({ createdAt, title: "Original" }));
    await saveAgentSession({
      id,
      projectId: "proj-1",
      title: "Updated",
      messages: [userMessage("updated")],
      createdAt,
      updatedAt: createdAt,
    });

    expect(await db.agentSessions.count()).toBe(1);
    const stored = await getAgentSession(id);
    expect(stored?.title).toBe("Updated");
    expect(stored?.createdAt).toBe(createdAt);
    expect(stored?.updatedAt).toBeGreaterThan(createdAt);
  });

  it("preserves updatedAt when messages are unchanged", async () => {
    const messages = [userMessage("hello")];
    const id = await saveAgentSession(makeSession({ messages, title: "Original" }));
    const originalUpdatedAt = (await getAgentSession(id))!.updatedAt;

    await saveAgentSession({
      id,
      projectId: "proj-1",
      title: "Renamed without new messages",
      messages,
      createdAt: (await getAgentSession(id))!.createdAt,
      updatedAt: originalUpdatedAt,
    });

    const stored = await getAgentSession(id);
    expect(stored?.title).toBe("Renamed without new messages");
    expect(stored?.updatedAt).toBe(originalUpdatedAt);
  });
});

describe("listAgentSessions", () => {
  it("returns sessions for a project sorted by updatedAt descending", async () => {
    const oldId = await saveAgentSession(
      makeSession({ title: "Old", updatedAt: 100, createdAt: 100 }),
    );
    const middleId = await saveAgentSession(
      makeSession({ title: "Mid", updatedAt: 200, createdAt: 200 }),
    );
    const newestId = await saveAgentSession(
      makeSession({ title: "New", updatedAt: 300, createdAt: 300 }),
    );
    await saveAgentSession(
      makeSession({ projectId: "proj-2", title: "Other project", updatedAt: 400 }),
    );

    const list = await listAgentSessions("proj-1");
    expect(list.map((session) => session.id)).toEqual([newestId, middleId, oldId]);
  });
});

describe("deleteAgentSession", () => {
  it("removes a session", async () => {
    const id = await saveAgentSession(makeSession());
    await deleteAgentSession(id);
    expect(await getAgentSession(id)).toBeUndefined();
  });
});

describe("updateAgentSessionTitle", () => {
  it("updates the title", async () => {
    const id = await saveAgentSession(makeSession({ title: "Original" }));
    await updateAgentSessionTitle(id, "Renamed");

    expect((await getAgentSession(id))?.title).toBe("Renamed");
  });

  it("ignores blank titles", async () => {
    const id = await saveAgentSession(makeSession({ title: "Original" }));
    await updateAgentSessionTitle(id, "   ");

    expect((await getAgentSession(id))?.title).toBe("Original");
  });
});

describe("setAgentSessionPinned", () => {
  it("pins and unpins a session", async () => {
    const id = await saveAgentSession(makeSession());
    await setAgentSessionPinned(id, true);

    const pinned = await getAgentSession(id);
    expect(pinned?.pinnedAt).toBeGreaterThan(0);

    await setAgentSessionPinned(id, false);
    expect((await getAgentSession(id))?.pinnedAt).toBeUndefined();
  });
});

describe("saveAgentSession pinnedAt preservation", () => {
  it("preserves pinnedAt when upserting without pinnedAt in payload", async () => {
    const createdAt = 1_000;
    const id = await saveAgentSession(
      makeSession({ createdAt, pinnedAt: 2_000, title: "Pinned chat" }),
    );

    await saveAgentSession({
      id,
      projectId: "proj-1",
      title: "Updated title",
      messages: [userMessage("updated")],
      createdAt,
      updatedAt: createdAt,
    });

    const stored = await getAgentSession(id);
    expect(stored?.title).toBe("Updated title");
    expect(stored?.pinnedAt).toBe(2_000);
  });
});
