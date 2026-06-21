import { describe, it, expect, vi } from "vitest";
import {
  estimateStorage,
  isNearQuota,
  isStoragePersisted,
  requestPersistentStorage,
  type StorageManagerLike,
} from "./persistence";

describe("requestPersistentStorage", () => {
  it("returns the result of storage.persist()", async () => {
    const storage: StorageManagerLike = { persist: vi.fn(async () => true) };
    expect(await requestPersistentStorage(storage)).toBe(true);
  });

  it("returns false when persist is unavailable", async () => {
    expect(await requestPersistentStorage({})).toBe(false);
  });
});

describe("isStoragePersisted", () => {
  it("reflects storage.persisted()", async () => {
    const storage: StorageManagerLike = { persisted: vi.fn(async () => true) };
    expect(await isStoragePersisted(storage)).toBe(true);
  });
});

describe("estimateStorage", () => {
  it("computes percent from usage and quota", async () => {
    const storage: StorageManagerLike = {
      estimate: vi.fn(async () => ({ usage: 50, quota: 200 })),
    };
    expect(await estimateStorage(storage)).toEqual({
      usage: 50,
      quota: 200,
      percent: 0.25,
    });
  });

  it("treats a zero quota as 0 percent", async () => {
    const storage: StorageManagerLike = {
      estimate: vi.fn(async () => ({ usage: 0, quota: 0 })),
    };
    expect(await estimateStorage(storage)).toEqual({
      usage: 0,
      quota: 0,
      percent: 0,
    });
  });

  it("returns null when estimate is unavailable", async () => {
    expect(await estimateStorage({})).toBeNull();
  });
});

describe("isNearQuota", () => {
  it("is true at or above the threshold", () => {
    expect(isNearQuota({ usage: 90, quota: 100, percent: 0.9 })).toBe(true);
    expect(isNearQuota({ usage: 80, quota: 100, percent: 0.8 })).toBe(true);
  });

  it("is false below the threshold or when null", () => {
    expect(isNearQuota({ usage: 10, quota: 100, percent: 0.1 })).toBe(false);
    expect(isNearQuota(null)).toBe(false);
  });
});
