// Old SectionNodeSchema tests removed — replaced by schema.test.ts
// This file is intentionally left as a re-export verification only.

import { describe, it, expect } from "vitest";
import {
  BlockSchema,
  ReferenceSchema,
  PaperIRSchema,
} from "./index";

describe("ir/index barrel exports", () => {
  it("re-exports all schemas from the barrel", () => {
    expect(BlockSchema).toBeDefined();
    expect(ReferenceSchema).toBeDefined();
    expect(PaperIRSchema).toBeDefined();
  });
});
