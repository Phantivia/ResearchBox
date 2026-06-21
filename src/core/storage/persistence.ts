/** 用量超过该比例时提示用户清理。 */
export const STORAGE_WARN_THRESHOLD = 0.8;

export type StorageEstimate = {
  usage: number;
  quota: number;
  /** usage / quota，0~1；quota 为 0 时记为 0。 */
  percent: number;
};

/** navigator.storage 的最小可注入子集，便于单测。 */
export type StorageManagerLike = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
};

function resolveStorageManager(
  override?: StorageManagerLike,
): StorageManagerLike | undefined {
  if (override) {
    return override;
  }
  if (typeof navigator !== "undefined" && navigator.storage) {
    return navigator.storage as StorageManagerLike;
  }
  return undefined;
}

export async function requestPersistentStorage(
  storage?: StorageManagerLike,
): Promise<boolean> {
  const manager = resolveStorageManager(storage);
  if (!manager?.persist) {
    return false;
  }
  return manager.persist();
}

export async function isStoragePersisted(
  storage?: StorageManagerLike,
): Promise<boolean> {
  const manager = resolveStorageManager(storage);
  if (!manager?.persisted) {
    return false;
  }
  return manager.persisted();
}

export async function estimateStorage(
  storage?: StorageManagerLike,
): Promise<StorageEstimate | null> {
  const manager = resolveStorageManager(storage);
  if (!manager?.estimate) {
    return null;
  }
  const { usage = 0, quota = 0 } = await manager.estimate();
  const percent = quota > 0 ? usage / quota : 0;
  return { usage, quota, percent };
}

export function isNearQuota(
  estimate: StorageEstimate | null,
  threshold = STORAGE_WARN_THRESHOLD,
): boolean {
  return estimate !== null && estimate.quota > 0 && estimate.percent >= threshold;
}
