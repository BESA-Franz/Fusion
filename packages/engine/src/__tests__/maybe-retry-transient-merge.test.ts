/**
 * FNXC:EngineTests 2026-07-25-10:45:
 * Extracted from the deleted SQLite-backed FN-5743 reliability suite. Covers the
 * pure ProjectEngine.maybeRetryTransientMerge seam: a transient merge failure
 * re-queues the merge-request state without rebounding the task to todo.
 */

import { describe, expect, it, vi } from "vitest";
import { ProjectEngine } from "../project-engine.js";

describe("ProjectEngine.maybeRetryTransientMerge", () => {
  it("transient merge retry uses merge-request state transitions without todo rebound", async () => {
    vi.useFakeTimers();
    let state = "running";
    const internalEnqueueMerge = vi.fn();
    const fakeStore = {
      getSettings: vi.fn().mockResolvedValue({ mergeRequestContractShadowEnabled: true }),
      getMergeRequestRecord: vi.fn(() => ({ state, attemptCount: 0, lastError: null })),
      getMergeRequestRecordAsync: vi.fn(() => Promise.resolve({ state, attemptCount: 0, lastError: null })),
      transitionMergeRequestState: vi.fn((_taskId: string, toState: string) => {
        state = toState;
      }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      logEntry: vi.fn().mockResolvedValue(undefined),
      moveTask: vi.fn(),
    } as any;

    try {
      /*
      FNXC:EngineTests 2026-07-27-21:55:
      Assert both MR re-queue state and that internalEnqueueMerge is scheduled for the
      same task id so a regression cannot leave the request queued with no retry work.
      Production schedules the re-enqueue via setTimeout (5s * 2^retry); advance fake
      timers so the callback runs without a real wall-clock wait.
      */
      const retried = await (ProjectEngine.prototype as any).maybeRetryTransientMerge.call(
        { shuttingDown: false, internalEnqueueMerge },
        fakeStore,
        "FN-5743",
        { id: "FN-5743", mergeTransientRetryCount: 0 },
        "lease-handoff-failed: target-not-queued",
      );

      expect(retried).toBe(true);
      expect(state).toBe("queued");
      expect(fakeStore.moveTask).not.toHaveBeenCalled();
      expect(internalEnqueueMerge).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5000);
      expect(internalEnqueueMerge).toHaveBeenCalledWith("FN-5743");
    } finally {
      vi.useRealTimers();
    }
  });
});
