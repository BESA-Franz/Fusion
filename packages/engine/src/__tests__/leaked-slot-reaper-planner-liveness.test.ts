import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../executor.js";
import { activeSessionRegistry } from "../active-session-registry.js";
import { SelfHealingManager } from "../self-healing.js";

/*
FNXC:NodeWorktreeIsolation 2026-07-29-02:10 (FN-6756 — planner worktrees reaped from under live planners):
REGRESSION SUITE for a bug users hit: worktrees reaped while a planner was still
working in them.

MECHANISM. Under plan-in-place, specification runs while the card sits in
`todo`/`triage`. `reapLeakedConcurrencySlots` treats both columns as reapable
("a task waiting to run must not pin a worktree" — written before planning moved
there), and every gate ahead of the last one passes for a planner:

  - it IS a `listWorktreeHolders()` row: ensureTaskWorktreeForPlanning ->
    ensureGraphCustomNodeWorktree -> addActiveWorktree
  - `todo`/`triage` is a reapable column
  - it is NOT in the executor's `executing` set — a planner is triage-owned
  - planning routinely outlives the 60s LEAKED_WORKTREE_SLOT_GRACE_MS

...leaving `clearPhantomExecutorBinding` deciding alone. It computed liveness from
four TaskExecutor-owned sets only, so a triage planning session — which lives in
TriageProcessor's OWN activeSessions map and registers in the module-level
activeSessionRegistry — matched none of them. It returned true, released the slot,
and then unregistered the planner's registry paths: destroying the evidence that
proved the planner alive.

This is FN-8600 recurring through a second sweep. That fix registered planning
paths in the registry and taught the self-owned-branch reclaim sweep to consult
`isPathActive`. The leaked-slot reaper never got the same signal — fixed at one
surface, not enumerated across all.

The tests below assert the invariant at BOTH levels, because either alone is
insufficient: the unit case pins the guard, and the sweep case pins that the guard
is actually reached and honored by the reaper.
*/

function makeExecutorWithHeldWorktree(taskId: string, worktreePath: string): TaskExecutor {
  const executor = Object.create(TaskExecutor.prototype) as TaskExecutor;
  const priv = executor as unknown as Record<string, unknown>;
  // Exactly the surfaces the guard consults, all EMPTY — the true state during
  // planning, since the planner's session is held by TriageProcessor.
  priv.activeSessions = new Map();
  priv.activeStepExecutors = new Map();
  priv.activeWorkflowStepSessions = new Map();
  priv.activeCliTaskSessions = new Map();
  priv.activeWorktrees = new Map([[taskId, new Set([worktreePath])]]);
  priv.executing = new Set();
  priv.recoveringCompleted = new Set();
  priv.resumingUnpaused = new Set();
  priv.approvalSuspended = new Set();
  priv.approvalResumeAfterUnwind = new Set();
  priv.effectiveColumnAgentByTask = new Map();
  return executor;
}

const PLANNER_TASK = "FN-6756-PLANNER";
const PLANNER_WORKTREE = "/tmp/fn-6756-planner-worktree";

afterEach(() => {
  activeSessionRegistry.clear();
  vi.restoreAllMocks();
});

describe("FN-6756: a live planner's worktree survives the leaked-slot reaper", () => {
  /*
  Reverting the `registeredSessionPaths.length > 0` term in
  clearPhantomExecutorBinding turns this red: the method returns true and, worse,
  unregisters the planner's path on its way out.
  */
  it("clearPhantomExecutorBinding refuses when the task holds a registered session path", () => {
    const executor = makeExecutorWithHeldWorktree(PLANNER_TASK, PLANNER_WORKTREE);
    activeSessionRegistry.registerPath(PLANNER_WORKTREE, {
      taskId: PLANNER_TASK,
      kind: "planning",
      ownerKey: "triage:plan",
    });

    expect(executor.clearPhantomExecutorBinding(PLANNER_TASK)).toBe(false);

    // The binding and the registration must both survive the refusal — a refusal
    // that still tore down state would be worse than none.
    expect(activeSessionRegistry.isPathActive(PLANNER_WORKTREE)).toBe(true);
    expect(
      (executor as unknown as { activeWorktrees: Map<string, Set<string>> }).activeWorktrees.get(PLANNER_TASK),
    ).toEqual(new Set([PLANNER_WORKTREE]));
  });

  /*
  The kind is deliberately not part of the guard: any registered surface means
  someone is working in that worktree. Pinning one representative non-executor kind
  keeps a future "only refuse for kind === planning" narrowing honest.
  */
  it("refuses for any registered session kind, not just planning", () => {
    for (const kind of ["planning", "ai-merge", "step-session"] as const) {
      activeSessionRegistry.clear();
      const executor = makeExecutorWithHeldWorktree(PLANNER_TASK, PLANNER_WORKTREE);
      activeSessionRegistry.registerPath(PLANNER_WORKTREE, {
        taskId: PLANNER_TASK,
        kind,
        ownerKey: `owner:${kind}`,
      });
      expect(executor.clearPhantomExecutorBinding(PLANNER_TASK), `kind=${kind}`).toBe(false);
    }
  });

  /*
  The guard must NOT become a blanket refusal: a genuinely phantom binding — no
  executor surface AND no registration — is exactly what FN-6736's reaper exists to
  clear, and blocking it would trade this bug for a wedged queue.
  */
  it("still clears a genuine phantom binding with no registered session path", () => {
    const executor = makeExecutorWithHeldWorktree("FN-6756-PHANTOM", "/tmp/fn-6756-phantom-worktree");
    expect(activeSessionRegistry.pathsForTask("FN-6756-PHANTOM")).toEqual([]);
    expect(executor.clearPhantomExecutorBinding("FN-6756-PHANTOM")).toBe(true);
  });

  /*
  END TO END through the sweep itself. The unit case above proves the guard; this
  proves the reaper reaches and honors it for a card in a reapable column, past the
  grace, with the executor's sets empty — i.e. the exact reported shape.
  */
  it("reapLeakedConcurrencySlots does not reap a planning card in triage past the grace", async () => {
    const executor = makeExecutorWithHeldWorktree(PLANNER_TASK, PLANNER_WORKTREE);
    activeSessionRegistry.registerPath(PLANNER_WORKTREE, {
      taskId: PLANNER_TASK,
      kind: "planning",
      ownerKey: "triage:plan",
    });

    // Entered the column well past LEAKED_WORKTREE_SLOT_GRACE_MS (60s).
    const staleEntry = new Date(Date.now() - 10 * 60_000).toISOString();
    const store = {
      getSettings: vi.fn(async () => ({ globalPause: false, enginePaused: false })),
      getTask: vi.fn(async () => ({
        id: PLANNER_TASK,
        column: "triage",
        status: "planning",
        columnMovedAt: staleEntry,
        updatedAt: staleEntry,
      })),
      logEntry: vi.fn(async () => undefined),
    };

    const manager = Object.create(SelfHealingManager.prototype) as SelfHealingManager;
    (manager as unknown as Record<string, unknown>).store = store;
    (manager as unknown as Record<string, unknown>).options = {
      listWorktreeHolders: () => [{ taskId: PLANNER_TASK, worktreePath: PLANNER_WORKTREE }],
      getExecutingTaskIds: () => new Set<string>(),
      clearPhantomExecutorBinding: (taskId: string) => executor.clearPhantomExecutorBinding(taskId),
    };

    const reaped = await manager.reapLeakedConcurrencySlots();

    expect(reaped, "a live planner's slot must not be reaped").toBe(0);
    expect(activeSessionRegistry.isPathActive(PLANNER_WORKTREE)).toBe(true);
    expect(store.logEntry).not.toHaveBeenCalled();
  });
});
