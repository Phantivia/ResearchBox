import { describe, it, expect } from "vitest";
import {
  BackupParseError,
  parseBackup,
  selectRowsToWrite,
  serializeBackup,
} from "./backup";
import { BACKUP_FORMAT_VERSION, type Backup } from "./schema";

function makeBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: 1_700_000_000_000,
    projects: [
      { id: "p1", name: "Project 1", createdAt: 1, updatedAt: 2 },
    ],
    paperEntries: [
      {
        projectId: "p1",
        routeId: "2401.12345",
        importMethod: "arxiv-html",
        arxivId: "2401.12345",
        version: "latest",
        source: "2401.12345",
        title: "Paper One",
        authors: ["Alice"],
        status: "done",
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    papers: [
      {
        arxivId: "2401.12345",
        version: "latest",
        title: "Paper One",
        abstract: "Abstract.",
        abstractBlocks: [],
        authors: ["Alice"],
        blocks: [{ id: "b1", type: "paragraph", content: "Hello." }],
        references: [],
        createdAt: 1,
        modelUsed: "test-model",
      },
    ],
    annotations: [
      {
        id: 1,
        projectId: "p1",
        paperId: "2401.12345:latest",
        blockId: "b1",
        startOffset: 0,
        endOffset: 5,
        quote: "Hello",
        note: "note",
        createdAt: 3,
      },
    ],
    aiSessions: [
      { id: 1, paperId: "2401.12345:latest", messages: [{ role: "user" }], createdAt: 4 },
    ],
    settings: {
      activeProviderId: "openai",
      viewMode: "bilingual",
      targetLang: "zh",
      debugMode: false,
      uiLocale: "zh",
      lastProjectId: "p1",
      activePaletteId: "default",
      customPalette: null,
      semanticScholarApiKey: "",
      openAlexApiKey: "",
      allowWeb: false,
      allowCode: false,
      webSearchProvider: "tavily",
      tavilyApiKey: "",
      perplexityApiKey: "",
      permissionMode: "default",
    },
    ...overrides,
  };
}

describe("serializeBackup / parseBackup", () => {
  it("round-trips a backup through serialize and parse", () => {
    const backup = makeBackup();
    const restored = parseBackup(serializeBackup(backup));
    expect(restored).toEqual(backup);
  });

  it("round-trips a backup that includes secrets", () => {
    const backup = makeBackup({
      secrets: [{ provider: "openai", encryptedKey: '{"id":"openai"}' }],
    });
    const restored = parseBackup(serializeBackup(backup));
    expect(restored).toEqual(backup);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseBackup("{ not json")).toThrow(BackupParseError);
  });

  it("rejects JSON that does not match the backup schema", () => {
    expect(() => parseBackup(JSON.stringify({ formatVersion: 1 }))).toThrow(
      BackupParseError,
    );
  });

  it("rejects an unknown format version", () => {
    const backup = makeBackup();
    const tampered = { ...backup, formatVersion: 999 };
    expect(() => parseBackup(JSON.stringify(tampered))).toThrow(BackupParseError);
  });
});

describe("selectRowsToWrite", () => {
  const rows = [{ k: "a" }, { k: "b" }, { k: "c" }];
  const keyOf = (row: { k: string }) => row.k;

  it("returns all rows when strategy is overwrite", () => {
    const result = selectRowsToWrite(rows, keyOf, new Set(["a"]), "overwrite");
    expect(result).toEqual(rows);
  });

  it("filters out existing keys when strategy is skip", () => {
    const result = selectRowsToWrite(rows, keyOf, new Set(["a", "c"]), "skip");
    expect(result).toEqual([{ k: "b" }]);
  });
});
