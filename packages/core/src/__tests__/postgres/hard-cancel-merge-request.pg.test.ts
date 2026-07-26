/**
 * FNXC:EngineTests 2026-07-25-10:45:
 * FN-5743 hard-cancel must cancel a queued/running merge-request and clear the
 * completion handoff marker when the operator moves in-review → todo. The old
 * engine reliability suite used the removed sync SQLite TaskStore (VAL-REMOVAL-005)
 * and stayed red under exclude-without-ledger drift. This PG twin drives the real
 * moveTask path on AsyncDataLayer so full-suite no longer carries a silent red.
 *
 * Surface enumeration:
 * - user moveSource cancels queued merge-request + clears handoff marker and lands column=todo
 * - engine moveSource does not cancel (rebound path preserves merge state)
 *
 * FNXC:EngineTests 2026-07-26-07:20:
 * Review P2: include this file in packages/core `test:pg-gate` so the merge-blocking
 * PG gate fails on hard-cancel regressions rather than only full-suite.
 * Also assert persisted column=todo so side-effect-only assertions cannot pass while
 * the task remains in-review.
 */

import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import {
  pgDescribe,
  createSharedPgTaskStoreTestHarness,
  type SharedPgTaskStoreHarness,
} from "../../__test-utils__/pg-test-harness.js";

pgDescribe("FN-5743 hard-cancel merge-request cutover (PostgreSQL)", () => {
  const h: SharedPgTaskStoreHarness = createSharedPgTaskStoreTestHarness({
    prefix: "fusion_hc_mr",
  });

  beforeAll(h.beforeAll);
  beforeEach(h.beforeEach);
  afterEach(h.afterEach);
  afterAll(h.afterAll);

  async function seedInReviewWithQueuedMerge(description: string) {
    const store = h.store();
    const task = await store.createTask({ description });
    await store.moveTask(task.id, "todo", { moveSource: "user" });
    await store.moveTask(task.id, "in-progress", { moveSource: "user" });
    await store.handoffToReview(task.id, {
      ownerAgentId: "agent",
      evidence: { reason: "fn_task_done", runId: "run-1", agentId: "agent" },
    });
    await store.upsertMergeRequestRecord(task.id, { state: "queued", attemptCount: 1 });
    await store.setCompletionHandoffAcceptedMarker(task.id, { source: "executor:fn_task_done" });
    return { store, taskId: task.id };
  }

  it("cancels pending merge request on user in-review→todo hard-cancel", async () => {
    const { store, taskId } = await seedInReviewWithQueuedMerge("FN-5743 hard-cancel");

    await store.moveTask(taskId, "todo", { moveSource: "user" });

    // FNXC:EngineTests 2026-07-26-07:20: assert column transition, not only MR/marker side effects
    expect((await store.getTask(taskId)).column).toBe("todo");
    expect((await store.getMergeRequestRecordAsync(taskId))?.state).toBe("cancelled");
    expect(await store.getCompletionHandoffAcceptedMarker(taskId)).toBeNull();
  });

  it("does not cancel merge request on engine in-review→todo rebound", async () => {
    const { store, taskId } = await seedInReviewWithQueuedMerge("FN-5743 engine rebound");

    await store.moveTask(taskId, "todo", { moveSource: "engine" as "user" });

    expect((await store.getTask(taskId)).column).toBe("todo");
    expect((await store.getMergeRequestRecordAsync(taskId))?.state).toBe("queued");
    expect(await store.getCompletionHandoffAcceptedMarker(taskId)).not.toBeNull();
  });
});
