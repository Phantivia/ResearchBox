import { describe, it, expect } from "vitest";
import {
  parseProvenanceFromContent,
  provenanceForToolName,
  stripProvenancePrefix,
  withProvenance,
} from "./provenance";

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

describe("parseProvenanceFromContent", () => {
  it("extracts provenance from prefixed content", () => {
    expect(parseProvenanceFromContent("[来源: academic]\nresults")).toBe("academic");
  });

  it("returns null when prefix is missing", () => {
    expect(parseProvenanceFromContent("plain text")).toBeNull();
  });
});

describe("stripProvenancePrefix", () => {
  it("removes provenance prefix", () => {
    expect(stripProvenancePrefix("[来源: web]\nbody")).toBe("body");
  });
});

describe("provenanceForToolName", () => {
  it("maps paperbox tools", () => {
    expect(provenanceForToolName("paperbox_list")).toBe("paperbox");
    expect(provenanceForToolName("paperbox_fetch")).toBe("paperbox");
    expect(provenanceForToolName("retrieval")).toBe("paperbox");
  });

  it("maps academic and web tools", () => {
    expect(provenanceForToolName("academic_search")).toBe("academic");
    expect(provenanceForToolName("recommend_papers")).toBe("academic");
    expect(provenanceForToolName("websearch")).toBe("web");
  });

  it("returns null for unknown tools", () => {
    expect(provenanceForToolName("unknown_tool")).toBeNull();
  });
});
