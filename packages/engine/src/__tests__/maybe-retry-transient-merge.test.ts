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
    let state = "running";
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

    const retried = await (ProjectEngine.prototype as any).maybeRetryTransientMerge.call(
      { shuttingDown: false, internalEnqueueMerge: vi.fn() },
      fakeStore,
      "FN-5743",
      { id: "FN-5743", mergeTransientRetryCount: 0 },
      "lease-handoff-failed: target-not-queued",
    );

    expect(retried).toBe(true);
    expect(state).toBe("queued");
    expect(fakeStore.moveTask).not.toHaveBeenCalled();
  });
});
