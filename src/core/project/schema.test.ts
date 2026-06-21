import { describe, it, expect } from "vitest";
import { ProjectSchema } from "./schema";

describe("ProjectSchema", () => {
  it("parses a valid project", () => {
    const now = Date.now();
    const project = ProjectSchema.parse({
      id: "p-123",
      name: "我的项目",
      createdAt: now,
      updatedAt: now,
    });

    expect(project.id).toBe("p-123");
    expect(project.name).toBe("我的项目");
  });

  it("rejects an empty name", () => {
    const now = Date.now();
    const result = ProjectSchema.safeParse({
      id: "p-123",
      name: "",
      createdAt: now,
      updatedAt: now,
    });

    expect(result.success).toBe(false);
  });
});
