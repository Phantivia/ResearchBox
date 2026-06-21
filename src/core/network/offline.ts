export class OfflineUncachedError extends Error {
  constructor(public readonly arxivId: string) {
    super(`Paper ${arxivId} is not available offline`);
    this.name = "OfflineUncachedError";
  }
}

export type OnlineProbe = () => boolean;

export function isOffline(probe: OnlineProbe = defaultOnlineProbe): boolean {
  return !probe();
}

function defaultOnlineProbe(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}
