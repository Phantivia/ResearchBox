import { describe, it, expect } from "vitest";
import { ArtifactSchema } from "./schema";

describe("ArtifactSchema", () => {
  it("roundtrips a valid artifact", () => {
    const now = Date.now();
    const input = {
      id: "art-1",
      projectId: "proj-1",
      kind: "summary" as const,
      title: "文献综述摘要",
      content: "## 概述\n\n关键发现…",
      sourceCitations: ["2401.12345:v1#blk-3", "2401.99999:v1#blk-7"],
      createdAt: now,
      updatedAt: now,
    };

    const parsed = ArtifactSchema.parse(input);
    expect(parsed).toEqual(input);

    const again = ArtifactSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(again).toEqual(parsed);
  });

  it("rejects an invalid kind", () => {
    const now = Date.now();
    const result = ArtifactSchema.safeParse({
      id: "art-1",
      projectId: "proj-1",
      kind: "invalid",
      title: "Test",
      content: "",
      sourceCitations: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(result.success).toBe(false);
  });
});
