import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { pgDescribe, createSharedPgTaskStoreTestHarness } from "../__test-utils__/pg-test-harness.js";

/*
FNXC:RuntimeTaskOrchestrationAsync 2026-07-29-18:35:
FN-8361 exercises the live TaskStore persistence path. SQLite runtime support
was removed (VAL-REMOVAL-005), so the PostgreSQL harness is the real supported
storage path rather than a mocked moveTaskInternal seam.
*/
/*
FNXC:MergedPlanningColumn 2026-07-29-15:15 (U11 post-merge audit):
These fixtures create a task and then assert the LIVE-PREDICATE mechanism. U11 merged Todo into
Planning, so a freshly created default-workflow card now rests in `todo` rather than `triage` —
the predicates and the intermediate column are updated to match where the card actually is. What is
under test (moveTaskIf honouring a live predicate, skipping false ones, no-opping same-column) is
unchanged; only the column vocabulary moved underneath it.
*/
pgDescribe("moveTaskIf live storage path", () => {
  const harness = createSharedPgTaskStoreTestHarness({ prefix: "fusion_move_task_if" });
  beforeAll(harness.beforeAll);
  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);
  afterAll(harness.afterAll);

  it("moves only when the live predicate permits a real transition", async () => {
    const store = harness.store();
    const task = await store.createTask({ description: "conditional move" });
    const result = await store.moveTaskIf(task.id, "in-progress", (live) => live.column === "todo");

    expect(result.moved).toBe(true);
    expect(result.task.column).toBe("in-progress");
    expect((await store.getTask(task.id))?.column).toBe("in-progress");
  });

  it("skips false predicates, advanced stale candidates, and same-column no-ops", async () => {
    const store = harness.store();
    const falseTask = await store.createTask({ description: "false conditional move" });
    expect((await store.moveTaskIf(falseTask.id, "in-progress", () => false)).moved).toBe(false);
    expect((await store.getTask(falseTask.id))?.column).toBe("todo");

    const staleTask = await store.createTask({ description: "stale conditional move" });
    await store.getTask(staleTask.id); // Caller captured a stale planning-column candidate.
    await store.moveTask(staleTask.id, "in-progress");
    const stale = await store.moveTaskIf(staleTask.id, "in-progress", (live) => live.column === "todo");
    expect(stale).toMatchObject({ moved: false, task: { column: "in-progress" } });

    const sameColumn = await store.moveTaskIf(staleTask.id, "in-progress", () => true);
    expect(sameColumn.moved).toBe(false);
    expect(sameColumn.task.column).toBe("in-progress");
  });

  /*
  FNXC:SharedDatabaseNodeIdentity 2026-08-05-00:09:
  The scheduler route and column transition form one ownership decision. Event
  consumers must never observe the new processing column with the old route.
  */
  it("commits the dispatch route before emitting task:moved", async () => {
    const store = harness.store();
    const task = await store.createTask({ description: "atomic route move" });
    let emittedRoute: { id?: string; source?: string } | undefined;
    store.on("task:moved", ({ task: moved }) => {
      emittedRoute = {
        id: moved.effectiveNodeId,
        source: moved.effectiveNodeSource,
      };
    });

    const result = await store.moveTaskIf(task.id, "in-progress", () => true, {
      moveSource: "scheduler",
      dispatchRoute: {
        effectiveNodeId: "node_pc3",
        effectiveNodeSource: "task-override",
      },
    });

    expect(result.task).toMatchObject({
      column: "in-progress",
      effectiveNodeId: "node_pc3",
      effectiveNodeSource: "task-override",
    });
    expect(emittedRoute).toEqual({ id: "node_pc3", source: "task-override" });
  });

  it("does not overwrite a route changed by another TaskStore after the predicate snapshot", async () => {
    const store = harness.store();
    const { TaskStore } = await import("../store.js");
    const otherStore = new TaskStore(harness.rootDir(), undefined, { asyncLayer: harness.layer() });
    const task = await store.createTask({ description: "cross-process route race" });
    let releasePredicate!: () => void;
    let predicateStarted!: () => void;
    const started = new Promise<void>((resolve) => { predicateStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releasePredicate = resolve; });
    const prepareLockedMove = vi.fn(async () => ({
      dispatchRoute: {
        effectiveNodeId: "node_vps",
        effectiveNodeSource: "local" as const,
      },
    }));

    const moving = store.moveTaskIf(task.id, "in-progress", async () => {
      predicateStarted();
      await gate;
      return true;
    }, { moveSource: "scheduler", prepareLockedMove });
    await started;
    await otherStore.updateTask(task.id, { nodeId: "node_pc2" });
    releasePredicate();

    const result = await moving;
    expect(result).toMatchObject({ moved: false, task: { column: "todo", nodeId: "node_pc2" } });
    expect(prepareLockedMove).not.toHaveBeenCalled();
  });
});
