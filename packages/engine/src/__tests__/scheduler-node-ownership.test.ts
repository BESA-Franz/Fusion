import { describe, expect, it, vi } from "vitest";
import type { Task, TaskStore } from "@fusion/core";
import { Scheduler } from "../scheduler.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-SCHED-NODE",
    title: "Scheduler ownership",
    column: "in-progress",
    nodeId: "node-vps",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  } as Task;
}

describe("Scheduler post-release node ownership", () => {
  it.each([
    ["another node", { nodeId: "node-pc2" }],
    ["a non-WIP lane", { column: "in-review" }],
  ])("does not commit a released dispatch after the task moves to %s", async (_label, override) => {
    const live = task(override as Partial<Task>);
    const updateTaskAtomic = vi.fn(async (_id: string, updater: (current: Task) => unknown) => {
      await updater(live);
      return live;
    });
    const withPlanningLifecycleLock = vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback());
    const withTaskMutationLock = vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback());
    const store = {
      getSettings: vi.fn(async () => ({})),
      getTask: vi.fn(async () => live),
      updateTaskAtomic,
      withPlanningLifecycleLock,
      withTaskMutationLock,
      getTaskWorkflowSelectionAsync: vi.fn(async () => undefined),
      getWorkflowDefinition: vi.fn(async () => undefined),
      getRootDir: vi.fn(() => "/tmp/project"),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as TaskStore;
    const scheduler = new Scheduler(store, {
      localNodeId: "node-vps",
      registryLocalNodeId: "node-vps",
    });
    const persist = (scheduler as unknown as {
      persistReleasedDispatchIfStillOwned(id: string, patch: { status: null }): Promise<Task | null>;
    }).persistReleasedDispatchIfStillOwned.bind(scheduler);

    await expect(persist(live.id, { status: null })).resolves.toBeNull();
    expect(withPlanningLifecycleLock).toHaveBeenCalledWith(live.id, expect.any(Function));
    expect(withTaskMutationLock).toHaveBeenCalledWith(live.id, expect.any(Function));
  });
});
