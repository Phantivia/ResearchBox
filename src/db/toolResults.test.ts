import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db, addToolResult, getToolResult } from "./index";

beforeEach(async () => {
  await db.toolResults.clear();
});

describe("toolResults CRUD", () => {
  it("addToolResult persists content and returns an id", async () => {
    const id = await addToolResult({ content: "large serialized output" });

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const row = await db.toolResults.get(id);
    expect(row?.content).toBe("large serialized output");
    expect(row?.createdAt).toBeTypeOf("number");
  });

  it("getToolResult retrieves a stored row", async () => {
    const id = await addToolResult({ content: "payload" });
    const row = await getToolResult(id);

    expect(row).toEqual({
      id,
      content: "payload",
      createdAt: expect.any(Number),
    });
  });

  it("getToolResult returns undefined for unknown id", async () => {
    expect(await getToolResult("unknown")).toBeUndefined();
  });
});
