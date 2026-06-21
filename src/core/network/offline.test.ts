import { describe, it, expect } from "vitest";
import { isOffline, OfflineUncachedError } from "./offline";

describe("isOffline", () => {
  it("reflects the online probe", () => {
    expect(isOffline(() => true)).toBe(false);
    expect(isOffline(() => false)).toBe(true);
  });
});

describe("OfflineUncachedError", () => {
  it("exposes arxivId", () => {
    const err = new OfflineUncachedError("2401.12345");
    expect(err.name).toBe("OfflineUncachedError");
    expect(err.arxivId).toBe("2401.12345");
  });
});
