import { describe, expect, it, vi } from "vitest";
import {
  abortActiveAgentRun,
  getActiveAgentAbort,
  setActiveAgentAbort,
} from "./runController";

describe("runController", () => {
  it("tracks and clears the active abort controller", () => {
    const controller = new AbortController();
    setActiveAgentAbort(controller);
    expect(getActiveAgentAbort()).toBe(controller);

    abortActiveAgentRun();
    expect(getActiveAgentAbort()).toBeNull();
    expect(controller.signal.aborted).toBe(true);
  });

  it("abortActiveAgentRun is a no-op when nothing is active", () => {
    setActiveAgentAbort(null);
    expect(() => abortActiveAgentRun()).not.toThrow();
  });

  it("replaces the active controller when set again", () => {
    const first = new AbortController();
    const second = new AbortController();
    const abortSpy = vi.spyOn(first, "abort");

    setActiveAgentAbort(first);
    setActiveAgentAbort(second);

    expect(getActiveAgentAbort()).toBe(second);
    expect(abortSpy).not.toHaveBeenCalled();
  });
});
