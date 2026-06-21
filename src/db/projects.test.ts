import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./index";
import { putProject, getProject, listProjects, deleteProject } from "./projects";
import type { Project } from "@/core/project";

function makeProject(overrides: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    id: "p-1",
    name: "Test Project",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.projects.clear();
});

describe("putProject / getProject", () => {
  it("persists and retrieves a project by id", async () => {
    await putProject(makeProject());
    const stored = await getProject("p-1");
    expect(stored?.name).toBe("Test Project");
  });

  it("upserts on the same id", async () => {
    await putProject(makeProject());
    await putProject(makeProject({ name: "Renamed" }));
    expect(await db.projects.count()).toBe(1);
    const stored = await getProject("p-1");
    expect(stored?.name).toBe("Renamed");
  });
});

describe("listProjects", () => {
  it("returns projects sorted by updatedAt descending", async () => {
    await putProject(makeProject({ id: "a", updatedAt: 100 }));
    await putProject(makeProject({ id: "b", updatedAt: 300 }));
    await putProject(makeProject({ id: "c", updatedAt: 200 }));

    const list = await listProjects();
    expect(list.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
});

describe("deleteProject", () => {
  it("removes a project", async () => {
    await putProject(makeProject());
    await deleteProject("p-1");
    expect(await getProject("p-1")).toBeUndefined();
  });
});
