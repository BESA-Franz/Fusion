/*
FNXC:SharedDatabaseNodeOwnership 2026-08-05-05:05:
Production-shaped regression for the checkout/recovery race. The real
PostgreSQL advisory lock must keep a checkout claim out of the recovery
predicate/write window; an in-memory mock cannot prove that contract.
*/
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import {
  createSharedPgTaskStoreTestHarness,
  pgDescribe,
  type SharedPgTaskStoreHarness,
} from "../../__test-utils__/pg-test-harness.js";

const h: SharedPgTaskStoreHarness = createSharedPgTaskStoreTestHarness({
  prefix: "fusion_checkout_task_lock",
});

async function waitForBlockedAdvisoryLock(): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await h.adminSql()<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted = false
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
    `;
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("checkout claim did not wait on the task advisory lock");
}

pgDescribe("checkout task advisory lock (PostgreSQL)", () => {
  beforeAll(h.beforeAll);
  beforeEach(h.beforeEach);
  afterEach(h.afterEach);
  afterAll(h.afterAll);

  it("does not acquire a checkout between a recovery predicate and its patch", async () => {
    const store = h.store();
    const task = await store.createTaskWithReservedId(
      { description: "checkout recovery race", column: "in-progress" },
      { taskId: "FN-CHECKOUT-RACE", applyDefaultWorkflowSteps: false },
    );

    let claimSettled = false;
    let claimPromise!: ReturnType<typeof store.tryClaimCheckout>;
    const recovery = await store.withTaskMutationLock(task.id, async () => {
      const discovered = await store.getTask(task.id);
      expect(discovered.checkedOutBy).toBeUndefined();

      claimPromise = store.tryClaimCheckout(task.id, {
        agentId: "agent-new",
        nodeId: "node-new",
        runId: "run-new",
        leaseEpoch: 1,
        renewedAt: "2026-08-05T05:00:00.000Z",
      }, {
        expectedCheckedOutBy: null,
        expectedNodeId: null,
        expectedLeaseEpoch: 0,
      });
      void claimPromise.then(
        () => { claimSettled = true; },
        () => { claimSettled = true; },
      );

      await waitForBlockedAdvisoryLock();
      expect(claimSettled).toBe(false);

      return store.updateTaskAtomic(task.id, (live) => {
        expect(live.checkedOutBy).toBeUndefined();
        return {
          error: "recovery-patch-committed",
          checkedOutBy: null,
        };
      });
    });

    expect(recovery.checkedOutBy).toBeUndefined();
    const claim = await claimPromise;
    expect(claim).toMatchObject({
      ok: true,
      task: {
        checkedOutBy: "agent-new",
        checkoutNodeId: "node-new",
        checkoutLeaseEpoch: 1,
        error: "recovery-patch-committed",
      },
    });

    store.taskCache.delete(task.id);
    await expect(store.getTask(task.id)).resolves.toMatchObject({
      checkedOutBy: "agent-new",
      checkoutNodeId: "node-new",
      error: "recovery-patch-committed",
    });
  });

  it("invalidates a conditional move when a claim wins after its predicate", async () => {
    const store = h.store();
    const task = await store.createTaskWithReservedId(
      { description: "checkout move race", column: "in-progress" },
      { taskId: "FN-CHECKOUT-MOVE-RACE", applyDefaultWorkflowSteps: false },
    );

    const moved = await store.moveTaskIf(task.id, "todo", async (live) => {
      expect(live.checkedOutBy).toBeUndefined();
      await expect(store.tryClaimCheckout(task.id, {
        agentId: "agent-between-predicate-and-move",
        nodeId: "node-between-predicate-and-move",
        runId: "run-between-predicate-and-move",
        leaseEpoch: 1,
        renewedAt: "2026-08-05T05:10:00.000Z",
      }, {
        expectedCheckedOutBy: null,
        expectedNodeId: null,
        expectedLeaseEpoch: 0,
      })).resolves.toMatchObject({ ok: true });
      return true;
    }, {
      preserveProgress: true,
      moveSource: "engine",
      recoveryRehome: true,
    });

    expect(moved.moved).toBe(false);
    expect(moved.task).toMatchObject({
      column: "in-progress",
      checkedOutBy: "agent-between-predicate-and-move",
      checkoutNodeId: "node-between-predicate-and-move",
    });
  });
});
