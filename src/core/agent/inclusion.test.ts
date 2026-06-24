import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaperIR } from "@/core/ir";
import { resolvePaperEntryStatus } from "@/core/paper";
import {
  InclusionError,
  includePaperFromSearch,
  routeIdForSearchHit,
} from "./inclusion";

const addInput = vi.fn<(projectId: string, source: string) => Promise<string | null>>();
const recordProcessing = vi.fn<(projectId: string, routeId: string) => Promise<void>>();
const recordPaper = vi.fn<
  (
    projectId: string,
    routeId: string,
    ir: PaperIR,
    status: string,
  ) => Promise<void>
>();
const recordError = vi.fn<(projectId: string, routeId: string, message: string) => Promise<void>>();

vi.mock("@/store", () => ({
  usePaperStore: {
    getState: () => ({
      addInput,
      recordProcessing,
      recordPaper,
      recordError,
    }),
  },
}));

const loadPaperForDisplay = vi.fn<
  (input: string) => Promise<{ kind: "cache" | "readonly"; ir: PaperIR }>
>();

vi.mock("@/core/pipeline/loadPaper", () => ({
  loadPaperForDisplay: (input: string) => loadPaperForDisplay(input),
}));

const MOCK_IR: PaperIR = {
  arxivId: "2401.12345",
  version: "latest",
  title: "Test Paper",
  authors: ["Alice"],
  abstract: "An abstract.",
  abstractBlocks: [],
  blocks: [],
  references: [],
  createdAt: 1,
  modelUsed: "none",
};

describe("includePaperFromSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addInput.mockResolvedValue("2401.12345");
    recordProcessing.mockResolvedValue(undefined);
    recordPaper.mockResolvedValue(undefined);
    recordError.mockResolvedValue(undefined);
    loadPaperForDisplay.mockResolvedValue({ kind: "readonly", ir: MOCK_IR });
  });

  it("calls addInput with projectId and arxivId and returns routeId", async () => {
    const result = await includePaperFromSearch({
      projectId: "proj-1",
      arxivId: "2401.12345",
    });

    expect(addInput).toHaveBeenCalledOnce();
    expect(addInput).toHaveBeenCalledWith("proj-1", "2401.12345");
    expect(result).toEqual({ routeId: "2401.12345" });
  });

  it("uses the same Reader IR prefetch chain after addInput", async () => {
    await includePaperFromSearch({
      projectId: "proj-1",
      arxivId: "2401.12345",
    });

    expect(recordProcessing).toHaveBeenCalledWith("proj-1", "2401.12345");
    expect(loadPaperForDisplay).toHaveBeenCalledWith("2401.12345");
    expect(recordPaper).toHaveBeenCalledWith(
      "proj-1",
      "2401.12345",
      MOCK_IR,
      resolvePaperEntryStatus(MOCK_IR),
    );
    expect(recordError).not.toHaveBeenCalled();
  });

  it("throws InclusionError when arxivId is invalid", async () => {
    addInput.mockResolvedValue(null);

    await expect(
      includePaperFromSearch({ projectId: "proj-1", arxivId: "not-valid" }),
    ).rejects.toMatchObject({
      reason: "invalid_arxiv_id",
    });

    expect(recordProcessing).not.toHaveBeenCalled();
    expect(loadPaperForDisplay).not.toHaveBeenCalled();
  });

  it("treats duplicate inclusion as idempotent via addInput", async () => {
    addInput.mockResolvedValue("2401.12345");

    const first = await includePaperFromSearch({
      projectId: "proj-1",
      arxivId: "2401.12345",
    });
    const second = await includePaperFromSearch({
      projectId: "proj-1",
      arxivId: "2401.12345",
    });

    expect(first.routeId).toBe("2401.12345");
    expect(second.routeId).toBe("2401.12345");
    expect(addInput).toHaveBeenCalledTimes(2);
  });

  it("records error when IR prefetch fails", async () => {
    loadPaperForDisplay.mockRejectedValue(new Error("fetch failed"));

    await expect(
      includePaperFromSearch({ projectId: "proj-1", arxivId: "2401.12345" }),
    ).rejects.toThrow("fetch failed");

    expect(recordError).toHaveBeenCalledWith("proj-1", "2401.12345", "fetch failed");
  });
});

describe("routeIdForSearchHit", () => {
  it("returns versioned routeId when version is present", () => {
    expect(routeIdForSearchHit("2401.12345v2")).toBe("2401.12345v2");
  });

  it("returns bare arxivId for latest version", () => {
    expect(routeIdForSearchHit("2401.12345")).toBe("2401.12345");
  });
});

describe("InclusionError", () => {
  it("exposes reason for invalid arxiv id", () => {
    const error = new InclusionError("invalid_arxiv_id", "bad id");
    expect(error).toBeInstanceOf(Error);
    expect(error.reason).toBe("invalid_arxiv_id");
  });
});
