import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  db,
  saveArtifact,
  getArtifact,
  listArtifacts,
  deleteArtifact,
} from "./index";
import type { Artifact } from "@/core/agent/artifact/schema";

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const now = Date.now();
  return {
    id: "art-1",
    projectId: "proj-1",
    kind: "summary",
    title: "Test Summary",
    content: "## Overview\n\nKey findings.",
    sourceCitations: ["2401.12345:v1#blk-1"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.artifacts.clear();
});

describe("saveArtifact / getArtifact", () => {
  it("persists and retrieves an artifact by id", async () => {
    const artifact = makeArtifact();
    await saveArtifact(artifact);

    const stored = await getArtifact("art-1");
    expect(stored).toEqual(artifact);
  });

  it("upserts on the same id", async () => {
    await saveArtifact(makeArtifact());
    await saveArtifact(makeArtifact({ title: "Updated Title" }));

    expect(await db.artifacts.count()).toBe(1);
    const stored = await getArtifact("art-1");
    expect(stored?.title).toBe("Updated Title");
  });
});

describe("listArtifacts", () => {
  it("returns artifacts for a project sorted by updatedAt descending", async () => {
    await saveArtifact(
      makeArtifact({ id: "a", projectId: "proj-1", updatedAt: 100 }),
    );
    await saveArtifact(
      makeArtifact({ id: "b", projectId: "proj-1", updatedAt: 300 }),
    );
    await saveArtifact(
      makeArtifact({ id: "c", projectId: "proj-2", updatedAt: 200 }),
    );

    const list = await listArtifacts("proj-1");
    expect(list.map((a) => a.id)).toEqual(["b", "a"]);
  });
});

describe("deleteArtifact", () => {
  it("removes an artifact", async () => {
    await saveArtifact(makeArtifact());
    await deleteArtifact("art-1");
    expect(await getArtifact("art-1")).toBeUndefined();
  });
});
