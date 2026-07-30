import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings, Task, TaskStore } from "@fusion/core";
import { SelfHealingManager } from "../self-healing.js";

const OLD = "2026-01-01T00:00:00.000Z";

function planningTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-multinode-planning",
    title: "Multi-node planning",
    description: "Multi-node planning",
    column: "triage",
    status: "planning",
    paused: false,
    priority: "normal",
    sourceType: "task_refine",
    planningStartedAt: OLD,
    cumulativePlanningMs: 0,
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: OLD,
    updatedAt: OLD,
    ...overrides,
  } as Task;
}

function storeFor(
  initialTask: Task,
  settings: Partial<Settings> = {},
): TaskStore & EventEmitter {
  let task = initialTask;
  return Object.assign(new EventEmitter(), {
    getSettings: vi.fn(async () => ({
      globalPause: false,
      enginePaused: false,
      ...settings,
    }) as Settings),
    listTasks: vi.fn(async () => [task]),
    getTask: vi.fn(async () => task),
    updateTask: vi.fn(async (_id: string, patch: Partial<Task>) => {
      task = { ...task, ...patch };
      return task;
    }),
    logEntry: vi.fn(async () => undefined),
    recordRunAuditEvent: vi.fn(async () => undefined),
  }) as unknown as TaskStore & EventEmitter;
}

function managerFor(
  store: TaskStore,
  options: {
    localNodeId?: string;
    recoverApprovedTriageTask?: (task: Task) => Promise<boolean>;
  } = {},
): SelfHealingManager {
  return new SelfHealingManager(store, {
    rootDir: "/tmp/test-project",
    localNodeId: options.localNodeId,
    recoverApprovedTriageTask: options.recoverApprovedTriageTask,
    getPlanningTaskIds: () => new Set<string>(),
    hasActivePlanningWorkflowSession: () => false,
  });
}

describe("multi-node planning self-healing ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /*
  FNXC:MultiNodePlanningRecovery 2026-07-30-07:35:
  A shared PostgreSQL control plane must not let one Fusion node classify another
  node's active planner as orphaned merely because planner liveness is process-local.
  */
  it.each([
    {
      label: "task override",
      taskRouting: { nodeId: "node-pc2" },
      settingsRouting: {},
    },
    {
      label: "project default",
      taskRouting: {},
      settingsRouting: { defaultNodeId: "node-pc2" },
    },
    {
      label: "materialized effective owner",
      taskRouting: { nodeId: "node-pc1", effectiveNodeId: "node-pc2" },
      settingsRouting: { defaultNodeId: "node-pc1" },
    },
  ])("does not recover foreign planning selected by $label", async ({ taskRouting, settingsRouting }) => {
    const task = planningTask(taskRouting);
    const store = storeFor(task, settingsRouting);
    const manager = managerFor(store, { localNodeId: "node-pc1" });

    expect(await manager.recoverOrphanedPlanningTasks()).toBe(0);
    expect(store.updateTask).not.toHaveBeenCalled();
    expect(store.logEntry).not.toHaveBeenCalled();

    manager.stop();
  });

  it("continues orphan recovery for the matching local node", async () => {
    const task = planningTask({ nodeId: "node-pc1" });
    const store = storeFor(task);
    const manager = managerFor(store, { localNodeId: "node-pc1" });

    expect(await manager.recoverOrphanedPlanningTasks()).toBe(1);
    expect(store.updateTask).toHaveBeenCalledWith(task.id, { status: null });

    manager.stop();
  });

  it("preserves legacy recovery when the process has no configured node identity", async () => {
    const task = planningTask({ nodeId: "node-pc2" });
    const store = storeFor(task);
    const manager = managerFor(store);

    expect(await manager.recoverOrphanedPlanningTasks()).toBe(1);
    expect(store.updateTask).toHaveBeenCalledWith(task.id, { status: null });

    manager.stop();
  });

  it("keeps every process-local planning recovery sweep away from foreign-node work", async () => {
    const task = planningTask({ nodeId: "node-pc2" });
    const store = storeFor(task);
    const recoverApproved = vi.fn(async () => true);
    const manager = managerFor(store, {
      localNodeId: "node-pc1",
      recoverApprovedTriageTask: recoverApproved,
    });

    expect(await manager.recoverApprovedTriageTasks()).toBe(0);
    expect(recoverApproved).not.toHaveBeenCalled();

    vi.mocked(store.listTasks).mockResolvedValue([
      task,
      ...["A", "B", "C"].map((suffix, index) => planningTask({
        id: `FN-peer-${suffix}`,
        column: "todo",
        status: null,
        sourceType: "dashboard_ui",
        planningStartedAt: null,
        updatedAt: `2026-01-01T00:0${index + 1}:00.000Z`,
      })),
    ]);
    expect(await manager.recoverStarvedRefinementTriageTasks()).toBe(0);
    expect(store.updateTask).not.toHaveBeenCalled();

    vi.mocked(store.listTasks).mockResolvedValue([task]);
    expect(await manager.finalizeOrphanedPlanningSegments()).toBe(0);
    expect(store.updateTask).not.toHaveBeenCalled();

    manager.stop();
  });
});
