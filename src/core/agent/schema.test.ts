import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toToolSchema } from "./schema";
import type { Tool } from "./types";

const inputSchema = z.strictObject({
  query: z.string(),
  topK: z.number().default(5),
  paperIds: z.array(z.string()).optional(),
});

const stubTool: Tool<typeof inputSchema, unknown> = {
  name: "retrieval",
  description: "Search paper blocks by query",
  inputSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: async () => ({ behavior: "allow", updatedInput: {} }),
  async *call() {
    return { data: null };
  },
};

describe("toToolSchema", () => {
  it("converts Tool.inputSchema to JSON Schema with correct type, properties, and required", () => {
    const { inputSchema: jsonSchema } = toToolSchema(stubTool);

    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties).toEqual({
      query: { type: "string" },
      topK: { default: 5, type: "number" },
      paperIds: {
        type: "array",
        items: { type: "string" },
      },
    });
    expect(jsonSchema.required).toEqual(["query", "topK"]);
    expect(jsonSchema.additionalProperties).toBe(false);
  });

  it("copies tool name and description", () => {
    const schema = toToolSchema(stubTool);

    expect(schema.name).toBe("retrieval");
    expect(schema.description).toBe("Search paper blocks by query");
  });
});
