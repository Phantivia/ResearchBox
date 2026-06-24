import { describe, it, expect } from "vitest";
import { withProvenance } from "./provenance";

describe("withProvenance", () => {
  it("prefixes paperbox provenance", () => {
    expect(withProvenance("paperbox", "catalog")).toBe(
      "[来源: paperbox]\ncatalog",
    );
  });

  it("prefixes academic provenance", () => {
    expect(withProvenance("academic", "hits")).toBe(
      "[来源: academic]\nhits",
    );
  });

  it("prefixes web provenance", () => {
    expect(withProvenance("web", "results")).toBe("[来源: web]\nresults");
  });
});
