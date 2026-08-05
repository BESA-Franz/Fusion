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

  it("rejects an old executor renewal after recovery clears or replaces its lease", async () => {
    const store = h.store();
    const task = await store.createTaskWithReservedId(
      { description: "checkout renewal recovery race", column: "in-progress" },
      { taskId: "FN-CHECKOUT-RENEWAL-RACE", applyDefaultWorkflowSteps: false },
    );
    await expect(store.tryClaimCheckout(task.id, {
      agentId: "agent-old",
      nodeId: "node-old",
      runId: "run-old",
      leaseEpoch: 1,
      renewedAt: "2026-08-05T05:20:00.000Z",
    }, {
      expectedCheckedOutBy: null,
      expectedNodeId: null,
      expectedLeaseEpoch: 0,
    })).resolves.toMatchObject({ ok: true });

    let renewalSettled = false;
    let renewalPromise!: ReturnType<typeof store.renewCheckoutLease>;
    await store.withTaskMutationLock(task.id, async () => {
      renewalPromise = store.renewCheckoutLease(task.id, {
        agentId: "agent-old",
        nodeId: "node-old",
        leaseEpoch: 1,
        checkoutRunId: "run-old-late",
        checkoutLeaseRenewedAt: "2026-08-05T05:30:00.000Z",
      });
      void renewalPromise.then(
        () => { renewalSettled = true; },
        () => { renewalSettled = true; },
      );

      await waitForBlockedAdvisoryLock();
      expect(renewalSettled).toBe(false);
      await store.updateTaskAtomic(task.id, (live) => ({
        checkedOutBy: null,
        checkoutNodeId: null,
        checkoutRunId: null,
        checkoutLeaseRenewedAt: null,
        checkoutLeaseEpoch: (live.checkoutLeaseEpoch ?? 0) + 1,
      }));
    });

    await expect(renewalPromise).rejects.toThrow(/renewal precondition failed/i);
    store.taskCache.delete(task.id);
    await expect(store.getTask(task.id)).resolves.toMatchObject({
      checkoutLeaseEpoch: 2,
    });
    const current = await store.getTask(task.id);
    expect(current.checkedOutBy).toBeUndefined();
    expect(current.checkoutNodeId).toBeUndefined();
    expect(current.checkoutRunId).toBeUndefined();
    expect(current.checkoutLeaseRenewedAt).toBeUndefined();

    await expect(store.tryClaimCheckout(task.id, {
      agentId: "agent-new",
      nodeId: "node-new",
      runId: "run-new",
      leaseEpoch: 3,
      renewedAt: "2026-08-05T05:40:00.000Z",
    }, {
      expectedCheckedOutBy: null,
      expectedNodeId: null,
      expectedLeaseEpoch: 2,
    })).resolves.toMatchObject({ ok: true });

    await expect(store.renewCheckoutLease(task.id, {
      agentId: "agent-old",
      nodeId: "node-old",
      leaseEpoch: 1,
      checkoutRunId: "run-old-after-reclaim",
      checkoutLeaseRenewedAt: "2026-08-05T05:50:00.000Z",
    })).rejects.toThrow(/renewal precondition failed/i);

    store.taskCache.delete(task.id);
    await expect(store.getTask(task.id)).resolves.toMatchObject({
      checkedOutBy: "agent-new",
      checkoutNodeId: "node-new",
      checkoutRunId: "run-new",
      checkoutLeaseEpoch: 3,
      checkoutLeaseRenewedAt: "2026-08-05T05:40:00.000Z",
    });
  });
});
